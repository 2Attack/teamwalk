import { asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, sqlClient } from '@/lib/db';
import { routePoints, routes, walks } from '@/lib/db/schema';
import { ROUTE, positionOnRoute } from '@/lib/hints/route';
import type { MapLayoutDto, RouteAdminDto, RouteCityDto } from '@/lib/types';
import { mapLayoutSchema } from '@/lib/validation';

/**
 * SETTINGS-zone queries: team route catalog (spec § 6.12).
 *
 * The Neon HTTP driver has no transactions, so every multi-row mutation here
 * is a single SQL statement (data-modifying CTEs) — the same guarantee a
 * transaction would give, without pretending the driver can hold one.
 */

/** The active route resolved for consumers, with the static fallback applied. */
export interface ActiveRoute {
  /** null — the table is empty and the hardcoded ROUTE fallback is in effect. */
  id: string | null;
  points: RouteCityDto[];
  baseKm: number;
  mapLayout: MapLayoutDto | null;
}

/** Stored jsonb passes the same schema as LLM output; junk degrades to null. */
function parseLayout(raw: unknown): MapLayoutDto | null {
  if (!raw) return null;
  const parsed = mapLayoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
 * Active route with the ROUTE fallback (spec § 6.12.6): an empty table must
 * not break the home screen or hints.
 */
export async function getActiveRoute(): Promise<ActiveRoute> {
  const rows = await db
    .select({
      id: routes.id,
      baseKm: routes.baseKm,
      mapLayout: routes.mapLayout,
    })
    .from(routes)
    .where(eq(routes.isActive, true))
    .limit(1);

  const row = rows[0];
  if (!row) return { id: null, points: ROUTE.map((c) => ({ ...c })), baseKm: 0, mapLayout: null };

  const points = (await loadPoints([row.id])).get(row.id) ?? [];
  if (points.length < 2) {
    // A route that lost its points (should be impossible past validation) is
    // treated the same as no route at all.
    return { id: null, points: ROUTE.map((c) => ({ ...c })), baseKm: 0, mapLayout: null };
  }

  return {
    id: row.id,
    points,
    baseKm: Number(row.baseKm),
    mapLayout: parseLayout(row.mapLayout),
  };
}

/** All routes for the settings list, active first, then by name. */
export async function listRoutesAdmin(): Promise<RouteAdminDto[]> {
  const rows = await db
    .select({
      id: routes.id,
      name: routes.name,
      baseKm: routes.baseKm,
      isActive: routes.isActive,
      mapLayout: routes.mapLayout,
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
      hasMapLayout: parseLayout(row.mapLayout) !== null,
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
 * Partial update. Points are replaced wholesale in one statement (spec
 * § 6.12.2) — delete + insert inside a single CTE, atomic without a
 * transaction. Editing points invalidates the stored map layout: the map must
 * not show cities the route no longer has.
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
         update routes
         set map_layout = null, map_generated_at = null
         where id = $1
         returning id
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

/** Persist a freshly generated (and already validated) map layout. */
export async function saveMapLayout(id: string, layout: MapLayoutDto): Promise<boolean> {
  const rows = await db
    .update(routes)
    .set({ mapLayout: layout, mapGeneratedAt: new Date() })
    .where(eq(routes.id, id))
    .returning({ id: routes.id });
  return rows.length > 0;
}

/**
 * Route selection (spec § 6.12.2): one UPDATE over the whole table flips the
 * active flag atomically; `resetProgress` moves `base_km` to the current
 * all-time total so the new route starts from zero.
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

  await sqlClient.query(
    `update routes set
       is_active = (id = $1),
       base_km = case
         when id = $1 and $2 then coalesce(
           (select sum(distance_km) from walks where status = 'finished'), 0)
         else base_km
       end`,
    [id, resetProgress],
  );

  return getRouteAdmin(id);
}

export type DeleteRouteResult = 'deleted' | 'not_found' | 'active' | 'last';

/**
 * Deletes a non-active route (spec § 6.12.2). The WHERE encodes both guards —
 * not active and not the last one — so the checks race-proofly share the
 * statement with the delete itself.
 */
export async function deleteRoute(id: string): Promise<DeleteRouteResult> {
  const rows = await sqlClient.query(
    `delete from routes
     where id = $1
       and not is_active
       and (select count(*) from routes) > 1
     returning id`,
    [id],
  );
  if ((rows as unknown[]).length > 0) return 'deleted';

  const current = await db
    .select({ isActive: routes.isActive })
    .from(routes)
    .where(eq(routes.id, id))
    .limit(1);
  if (!current[0]) return 'not_found';
  if (current[0].isActive) return 'active';
  return 'last';
}
