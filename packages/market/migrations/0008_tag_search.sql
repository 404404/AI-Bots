-- Rebuild only the derived search index; descriptor tags remain in the legacy roles column.
DROP TRIGGER indexed_repositories_fts_insert;
DROP TRIGGER indexed_repositories_fts_delete;
DROP TRIGGER indexed_repositories_fts_update;
DROP TABLE indexed_repositories_fts;

CREATE VIRTUAL TABLE indexed_repositories_fts USING fts5(
  name,
  description,
  topics,
  readme,
  roles,
  content = 'indexed_repositories',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);

CREATE TRIGGER indexed_repositories_fts_insert AFTER INSERT ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (rowid, name, description, topics, readme, roles)
  VALUES (new.rowid, new.name, new.description, new.topics, new.readme, new.roles);
END;

CREATE TRIGGER indexed_repositories_fts_delete AFTER DELETE ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (indexed_repositories_fts, rowid, name, description, topics, readme, roles)
  VALUES ('delete', old.rowid, old.name, old.description, old.topics, old.readme, old.roles);
END;

CREATE TRIGGER indexed_repositories_fts_update AFTER UPDATE ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (indexed_repositories_fts, rowid, name, description, topics, readme, roles)
  VALUES ('delete', old.rowid, old.name, old.description, old.topics, old.readme, old.roles);
  INSERT INTO indexed_repositories_fts (rowid, name, description, topics, readme, roles)
  VALUES (new.rowid, new.name, new.description, new.topics, new.readme, new.roles);
END;

INSERT INTO indexed_repositories_fts (indexed_repositories_fts) VALUES ('rebuild');
