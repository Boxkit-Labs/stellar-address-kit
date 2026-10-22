# Changelog

## 1.1.0

- **SEP-0029 memo requirement checking.**
  - Added `fetchMemoRequirement`, which queries Horizon
    (`GET /accounts/{id}`) and decodes the `config.memo_required` and
    `config.requiring_memo` data entries. Non-2xx responses (including 404
    for unfunded accounts) report `false`; network errors and malformed
    bodies throw.
  - Added `extractRoutingAsync`, which appends the
    `MISSING_REQUIRED_MEMO` error warning when a classic destination
    requires a memo but no routing ID was provided. Fetch failures fail
    open and preserve the synchronous result.
  - Added `RoutingWarning.missingRequiredMemo`.
  - Added the `http` package dependency; `http.Client` and the Horizon base
    URL are injectable for testnet and mock-based testing.

## 1.0.0

- Initial release of the Stellar Address Kit for Dart and Flutter.
- Support for G, M, and C address detection and validation.
- Support for SEP-0023 Muxed Address encoding and decoding.
- Routing extraction logic for reconciling incoming payments.
