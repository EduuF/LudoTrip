-- Contas e viagens da nuvem (spec publicação §5.1). Convites entram no M5.
-- LGPD precisa de atenção se o app escalar: e-mail e nome são dados pessoais (spec §6.4).

CREATE TABLE users (
  uid TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  photo_url TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- O que "Suas viagens" mostra; o TripRoom atualiza depois de cada ação.
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES users(uid),
  name TEXT NOT NULL,
  start TEXT,
  end TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE members (
  trip_id TEXT NOT NULL REFERENCES trips(id),
  uid TEXT NOT NULL REFERENCES users(uid),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, uid)
);

CREATE INDEX members_by_uid ON members(uid);
