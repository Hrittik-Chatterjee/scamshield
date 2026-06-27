# Phase 6 Checklist — Seed Data, Polish & Launch

- `[x]` Fix the scraped posts bug where comments were matching as top-level posts (Patched to use nesting filter instead of fragile hasHeading check, and verified)
- `[x]` Format long entity URLs as clean links on the admin page
- `[x]` Parse scraped photo links from complaint text and render as image grid
- `[x]` Create the `/about` and FAQ page with install instructions
- `[x]` Create the dedicated `/report-success` page with reference ID support
- `[x]` Modify `ReportForm.tsx` to redirect to `/report-success` instead of inline message
- `[x]` Populate `db/seed.sql` with 20+ realistic Bangladeshi e-commerce scam records
- `[x]` Seed the local D1 database with new data for testing and validation
- `[x]` Verify admin dashboard rendering and extension build end-to-end
