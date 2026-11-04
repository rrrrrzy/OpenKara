# ADR 0046 — Let users disable automatic online lyrics updates

Date: 2026-11-04
Status: accepted

## Context

Lyrics Acquisition can replace unsynced embedded lyrics with timed lyrics.
It can also upgrade Line-timed Lyrics from an Online Lyrics Source to
Word-timed Lyrics. Some users want to keep their existing lyrics while
still finding lyrics for songs that have none.

## Decision

Add an application preference, `auto_update_lyrics`, that defaults to true.
It controls only automatic replacement of existing nonempty lyrics. When
false, it blocks `automatic_upgrade` requests for those lyrics. First
acquisition for a song without lyrics and explicit `user_replace` requests
keep their existing behavior. Negative-cache and probe TTL rules stay.

The frontend checks the preference before a request and before it applies a
response. The backend checks it before HTTP and again before persistence.
The preference save and the final automatic cache write share a short lock.
HTTP never holds this lock. An automatic result that arrives after the
user disables updates cannot replace existing lyrics or stamp their probe.

The control uses the existing Settings preference store, config file, and
native checkbox pattern. It does not change the source order or the
protection rules in ADR 0027. Enabling it takes effect on the next normal
lyrics load; it does not start a request by itself.

## Consequences

- Existing installs keep their current behavior when the field is absent.
- Manual, sidecar, and timed embedded lyrics keep their existing protections.
- Disabling updates does not cancel HTTP that has already started.
- No lyrics cache migration, invalidation, or file rescan is required.
- The preference applies to this application, not to a Remote Repository.
