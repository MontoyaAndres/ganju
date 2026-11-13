-- Iconify stopped serving icons at "prefix:name.svg" (it answers 404); the same
-- icon is at "prefix/name.svg". Only rows still in the old shape change.
UPDATE "mcp_server_catalog"
SET "icon" = regexp_replace(
  "icon",
  '^(https://api\.iconify\.design/)([a-z0-9-]+):([a-z0-9-]+\.svg)$',
  '\1\2/\3'
)
WHERE "icon" ~ '^https://api\.iconify\.design/[a-z0-9-]+:[a-z0-9-]+\.svg$';
