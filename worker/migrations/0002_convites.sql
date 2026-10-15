-- Colaboração (spec publicação §4, §5.1): convites e viagens apagadas para todos (30 dias para voltar).

-- O token do convite (128 bits) só existe no link; aqui fica o SHA-256. O `id` é público e serve para
-- cancelar e listar.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  trip_id TEXT NOT NULL REFERENCES trips(id),
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  traveler_id TEXT,
  email TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT,
  used_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX invites_by_trip ON invites(trip_id);

ALTER TABLE trips ADD COLUMN deleted_by TEXT;
