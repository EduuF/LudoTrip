import type { Role } from '../src/sync/serverCore'
import type { Identity } from './auth'

// Consultas ao D1 (spec publicação §5.1). Contas, viagens e quem pode o quê.

export type { Role }

export interface TripRow {
  id: string
  owner_uid: string
  name: string
  start: string | null
  end: string | null
  version: number
  size_bytes: number
  created_at: number
  updated_at: number
  role: Role
}

export async function upsertUser(db: D1Database, who: Identity, now = Date.now()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (uid, name, email, photo_url, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(uid) DO UPDATE SET name = excluded.name, email = excluded.email, photo_url = excluded.photo_url`,
    )
    .bind(who.uid, who.name, who.email, who.picture, now)
    .run()
}

export async function roleOf(db: D1Database, tripId: string, uid: string): Promise<Role | null> {
  const row = await db
    .prepare(
      `SELECT m.role FROM members m JOIN trips t ON t.id = m.trip_id
       WHERE m.trip_id = ?1 AND m.uid = ?2 AND t.deleted_at IS NULL`,
    )
    .bind(tripId, uid)
    .first<{ role: Role }>()
  return row?.role ?? null
}

export async function tripOwner(db: D1Database, tripId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT owner_uid FROM trips WHERE id = ?1')
    .bind(tripId)
    .first<{ owner_uid: string }>()
  return row?.owner_uid ?? null
}

export async function myTrips(db: D1Database, uid: string): Promise<TripRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.owner_uid, t.name, t.start, t."end", t.version, t.size_bytes, t.created_at, t.updated_at, m.role
       FROM members m JOIN trips t ON t.id = m.trip_id
       WHERE m.uid = ?1 AND t.deleted_at IS NULL ORDER BY t.updated_at DESC`,
    )
    .bind(uid)
    .all<TripRow>()
  return results
}

/** Quantas pessoas a viagem tem (contando o Dono). */
export async function memberCount(db: D1Database, tripId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE trip_id = ?1')
    .bind(tripId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export async function countOwned(db: D1Database, uid: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM trips WHERE owner_uid = ?1 AND deleted_at IS NULL')
    .bind(uid)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export interface TripMetaRow {
  id: string
  name: string
  start: string | null
  end: string | null
  version: number
  sizeBytes: number
  updatedAt: number
}

/** Cria a viagem e o Dono numa transação só (batch do D1). */
export async function createTrip(db: D1Database, ownerUid: string, meta: TripMetaRow, now = Date.now()) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO trips (id, owner_uid, name, start, "end", version, size_bytes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        meta.id,
        ownerUid,
        meta.name,
        meta.start,
        meta.end,
        meta.version,
        meta.sizeBytes,
        now,
        meta.updatedAt,
      ),
    db
      .prepare(`INSERT INTO members (trip_id, uid, role, joined_at) VALUES (?1, ?2, 'owner', ?3)`)
      .bind(meta.id, ownerUid, now),
  ])
}

/** O TripRoom chama depois de cada ação: o que "Suas viagens" mostra fica em dia. */
export async function updateTripMeta(db: D1Database, meta: TripMetaRow): Promise<void> {
  await db
    .prepare(
      `UPDATE trips SET name = ?2, start = ?3, "end" = ?4, version = ?5, size_bytes = ?6, updated_at = ?7
       WHERE id = ?1 AND version <= ?5`,
    )
    .bind(meta.id, meta.name, meta.start, meta.end, meta.version, meta.sizeBytes, meta.updatedAt)
    .run()
}

/** Apaga de vez (o fim dos 30 dias em "Apagadas"). */
export async function purgeTrip(db: D1Database, tripId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM invites WHERE trip_id = ?1').bind(tripId),
    db.prepare('DELETE FROM members WHERE trip_id = ?1').bind(tripId),
    db.prepare('DELETE FROM trips WHERE id = ?1').bind(tripId),
  ])
}
