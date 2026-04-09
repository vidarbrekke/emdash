# Marketplace Backend Design

## Tables

extensions
- id
- name
- developer_id
- price
- type (subscription | one-time)

installs
- id
- user_id
- extension_id
- status (active | inactive)

licenses
- id
- user_id
- extension_id
- valid_until

## API Endpoints

GET /extensions
GET /extensions/:id
POST /extensions/install
POST /extensions/uninstall

## Rules
- All installs must create a license
- No extension runs without valid license
