-- Required by local-neon-http-proxy: it asks this "control plane" for the
-- allowed-IP list before every request and fails with 500 without it.
-- endpoint_id is the first label of the DB host (`db` from `db.localtest.me`).
create schema if not exists neon_control_plane;
create table if not exists neon_control_plane.endpoints (
  endpoint_id varchar(255) primary key,
  allowed_ips varchar(255)
);
insert into neon_control_plane.endpoints (endpoint_id, allowed_ips)
values ('db', '0.0.0.0/0')
on conflict (endpoint_id) do nothing;
