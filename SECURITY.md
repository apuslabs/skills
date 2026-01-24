# Security Notes

## Dependency Pinning

### @permaweb/aoconnect
- Must be pinned to version `0.0.68` for compatibility with `@ar.io/sdk@3.22.1`
- Newer versions cause "undefined data" signer failures in `ANT.setRecord()`
- Do not upgrade without testing ANT record updates

## Known Vulnerabilities

Current audit status (as of initial release):
- 22 vulnerabilities total: 11 low, 5 moderate, 3 high, 3 critical

### Critical Issues
- `elliptic` package vulnerabilities via `ethers`/`arbundles` dependency chain
- No fix available upstream at this time

### Risk Assessment
- This CLI primarily uses Arweave/RSA cryptographic flows
- The vulnerable packages are transitive dependencies from multi-chain support we don't use
- Risk is accepted for now; tracking upstream for fixes

### Mitigation
- Do not use this tool for Ethereum or other non-Arweave operations
- Monitor upstream packages for security updates
- Run `npm audit` periodically to check for fixes
