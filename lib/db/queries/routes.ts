import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db, sqlClient } from '@/lib/db';
import { routePoints, routes, walks } from '@/lib/db/schema';
import { positionOnRoute } from '@/lib/hints/route';
import type { RouteAdminDto, RouteCityDto } from '@/lib/types';

/**
 * SETTINGS-zone queries: team route catalog.
 *
 * The Neon HTTP driver has no transactions, so every multi-row mutation here
 * is a single SQL statement (data-modifying CTEs) — the same guarantee a
 * transaction would give, without pretending the driver can hold one.
 */

/** The active route resolved for consumers. */
export interface ActiveRoute {
  /** null — no route selected: the table is empty (points are empty too). */
  id: string | null;
  points: RouteCityDto[];
  baseKm: number;
}

async function loadPoints(routeIds: string[]): Promise<Map<string, RouteCityDto[]>> {
  const byRoute = new Map<string, RouteCityDto[]>();
  if (routeIds.length === 0) return byRoute;

  const rows = await db
    .select({ routeId: routePoints.routeId, city: routePoints.city, km: routePoints.km })
    .from(routePoints)
    .where(inArray(routePoints.routeId, routeIds))
    .orderBy(asc(routePoints.km));

  for (const row of rows) {
    const list = byRoute.get(row.routeId) ?? [];
    list.push({ city: row.city, km: Number(row.km) });
    byRoute.set(row.routeId, list);
  }
  return byRoute;
}

/** All-time finished km of the team — the base for route positions. */
async function teamTotalKm(): Promise<number> {
  const [row] = await db
    .select({
      totalKm: sql<number>`coalesce(sum(${walks.distanceKm}), 0)`.mapWith(Number),
    })
    .from(walks)
    .where(eq(walks.status, 'finished'));
  return Math.round((row?.totalKm ?? 0) * 100) / 100;
}

/**
 * Active route; an empty table (or a route that lost its points, impossible
 * past validation) resolves to the "no route selected" state — a legitimate
 * one, not an error.
 */
export async function getActiveRoute(): Promise<ActiveRoute> {
  const none: ActiveRoute = { id: null, points: [], baseKm: 0 };

  const rows = await db
    .select({ id: routes.id, baseKm: routes.baseKm })
    .from(routes)
    .where(eq(routes.isActive, true))
    .limit(1);

  const row = rows[0];
  if (!row) return none;

  const points = (await loadPoints([row.id])).get(row.id) ?? [];
  if (points.length < 2) return none;

  return { id: row.id, points, baseKm: Number(row.baseKm) };
}

/** All routes for the settings list, active first, then by name. */
export async function listRoutesAdmin(): Promise<RouteAdminDto[]> {
  const rows = await db
    .select({
      id: routes.id,
      name: routes.name,
      baseKm: routes.baseKm,
      isActive: routes.isActive,
    })
    .from(routes)
    .orderBy(desc(routes.isActive), asc(routes.name));

  const pointsByRoute = await loadPoints(rows.map((r) => r.id));
  const total = rows.some((r) => r.isActive) ? await teamTotalKm() : 0;

  return rows.map((row) => {
    const points = pointsByRoute.get(row.id) ?? [];
    let progress: RouteAdminDto['progress'] = null;
    if (row.isActive && points.length >= 2) {
      const walkedKm = Math.max(0, Math.round((total - Number(row.baseKm)) * 100) / 100);
      const position = positionOnRoute(points, walkedKm);
      progress = { walkedKm, nextCity: position.next?.city ?? null, kmLeft: position.kmLeft };
    }
    return {
      id: row.id,
      name: row.name,
      baseKm: Number(row.baseKm),
      isActive: row.isActive,
      points,
      progress,
    };
  });
}

export async function getRouteAdmin(id: string): Promise<RouteAdminDto | null> {
  const all = await listRoutesAdmin();
  return all.find((r) => r.id === id) ?? null;
}

/**
 * Creates a route with its points in ONE statement (data-modifying CTE):
 * a failure cannot leave a point-less route behind. Name conflicts surface as
 * unique violations of `routes_name_uniq` — no pre-check, races are real.
 */
export async function createRoute(input: {
  name: string;
  points: RouteCityDto[];
}): Promise<RouteAdminDto> {
  const rows = await sqlClient.query(
    `with r as (
       insert into routes (name) values ($1) returning id
     )
     insert into route_points (route_id, city, km)
     select r.id, p.city, p.km
     from r, jsonb_to_recordset($2::jsonb) as p(city text, km int)
     returning route_id`,
    [input.name, JSON.stringify(input.points)],
  );

  const routeId = (rows as Array<{ route_id: string }>)[0]?.route_id;
  if (!routeId) throw new Error('Route insert returned no rows');
  const created = await getRouteAdmin(routeId);
  if (!created) throw new Error('Route vanished right after insert');
  return created;
}

/**
 * Partial update. Points are replaced wholesale in one statement — delete + insert inside a single CTE, atomic without a
 * transaction.
 */
export async function updateRoute(
  id: string,
  patch: { name?: string; points?: RouteCityDto[] },
): Promise<RouteAdminDto | null> {
  if (patch.name !== undefined) {
    const updated = await db
      .update(routes)
      .set({ name: patch.name })
      .where(eq(routes.id, id))
      .returning({ id: routes.id });
    if (!updated[0]) return null;
  }

  if (patch.points !== undefined) {
    const rows = await sqlClient.query(
      `with target as (
         select id from routes where id = $1
       ), del as (
         delete from route_points where route_id in (select id from target)
       )
       insert into route_points (route_id, city, km)
       select target.id, p.city, p.km
       from target, jsonb_to_recordset($2::jsonb) as p(city text, km int)
       returning route_id`,
      [id, JSON.stringify(patch.points)],
    );
    if ((rows as unknown[]).length === 0) return null;
  }

  return getRouteAdmin(id);
}

/**
 * Route selection. Two statements, deactivation first: a
 * single whole-table UPDATE trips the `routes_one_active` partial unique
 * index — Postgres checks uniqueness row by row, and the new active row can
 * be flipped before the old one is cleared. The instant with no active route
 * between the statements is harmless: progress momentarily reads as "no route
 * selected", and a retry of the activation heals the state.
 */
export async function activateRoute(
  id: string,
  resetProgress: boolean,
): Promise<RouteAdminDto | null> {
  const exists = await db
    .select({ id: routes.id })
    .from(routes)
    .where(eq(routes.id, id))
    .limit(1);
  if (!exists[0]) return null;

  await db
    .update(routes)
    .set({ isActive: false })
    .where(and(eq(routes.isActive, true), ne(routes.id, id)));

  // `resetProgress` moves base_km to the current all-time total, so the
  // freshly selected route starts from zero.
  const rows = await sqlClient.query(
    `update routes set
       is_active = true,
       base_km = case
         when $2 then coalesce(
           (select sum(distance_km) from walks where status = 'finished'), 0)
         else base_km
       end
     where id = $1
     returning id`,
    [id, resetProgress],
  );
  if ((rows as unknown[]).length === 0) return null;

  return getRouteAdmin(id);
}

/**
 * Deletes a route, the active one included: routes are
 * optional, so deleting the active route just puts the home
 * screen into the "no route selected" state. The UI warns before doing it.
 * Returns false when the route does not exist.
 */
export async function deleteRoute(id: string): Promise<boolean> {
  const rows = await db
    .delete(routes)
    .where(eq(routes.id, id))
    .returning({ id: routes.id });
  return rows.length > 0;
}
