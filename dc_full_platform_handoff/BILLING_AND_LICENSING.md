# Billing and Licensing

## Principles
- Platform owns billing
- No external payments

## License Flow

User installs extension →
Create license →
Validate license on runtime →
Allow execution

## License Validation

function validateLicense(license) {
  if (!license) throw Error("No license")
  if (license.expired) throw Error("Expired")
}

## Revenue

- 20–30% platform fee
- Monthly subscriptions preferred

## Enforcement

- Disable extension if license invalid
- Never allow silent usage
