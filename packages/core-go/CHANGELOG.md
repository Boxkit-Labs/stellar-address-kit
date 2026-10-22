# Changelog

## 1.1.0

- **SEP-0029 memo requirement checking.**
  - Added `FetchMemoRequirement` / `FetchMemoRequirementContext`, which
    query Horizon (`GET /accounts/{id}`) and decode the `config.memo_required`
    and `config.requiring_memo` data entries. Non-2xx responses (including
    404 for unfunded accounts) report `false`; transport errors and
    malformed bodies return wrapped errors.
  - Added non-blocking `ExtractRoutingAsync`, which appends the
    `MISSING_REQUIRED_MEMO` error warning when a classic destination
    requires a memo but no routing ID was provided, and honours context
    cancellation. Fetch failures fail open and preserve the synchronous
    result.
  - Added the `MISSING_REQUIRED_MEMO` warning code to `address.WarningCode`.
  - Injectable HTTP client and Horizon base URL via `WithHTTPClient` /
    `WithHorizonURL`; standard library only.

## 1.0.1

- Initial tagged module release.
