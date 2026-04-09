# Extension SDK (TypeScript)

## Purpose
Provide a controlled way for developers to build extensions.

## Extension Manifest Example

export interface ExtensionManifest {
  name: string
  version: string
  capabilities: string[]
  permissions: string[]
}

## Example Extension

export const manifest: ExtensionManifest = {
  name: "example-extension",
  version: "1.0.0",
  capabilities: ["catalog.read"],
  permissions: ["orders.read"]
}

## Rules
- Must declare all capabilities
- Must declare permissions
- No direct DB access
- No overriding core logic
