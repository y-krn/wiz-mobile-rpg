# Exact-head device session template

Use for one observed device condition. This is an observation sheet, not a
claim that the device session occurred.

- Protocol version: `1.1`
- Session ID: `<YYYY-MM-DD-NN>`
- Usage mode: `first_after_change` / `steady_state` / `regression_check`
- Exact source SHA: `<40-character SHA>`
- Build/Preview identifier: `<identifier>`
- Date: `<YYYY-MM-DD>`
- Device class/model: `<model; no serial/device ID>`
- OS version: `<version>`
- Browser/webview: `<name and version>`
- Viewport: `<width>x<height>`
- Orientation: `<portrait|landscape>`
- Cold/warm: `<cold|warm|both|not_observed>`
- Network condition: `<relevant condition or not_applicable>`
- Golden Journey ID: `<tests/golden-journeys.js id>`
- Task ID: `<TASK-XX>`
- Observed friction codes: `<bounded codes or none>`
- Observation: `<what was directly observed>`
- Status: `PASS` / `finding` / `blocker` / `not_observed`
- Limitation: `<missing route, device, state, or condition>`
- Child Issue: `<number or none>`
