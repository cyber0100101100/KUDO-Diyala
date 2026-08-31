# Security Specification - KUDO KUDO Attendance

## Data Invariants
1. A user profile (`/users/{uid}`) must be created by the authenticated user matching the UID.
2. Attendance records (`/attendance/{id}`) must be associated with a valid user.
3. Chat rooms (`/chats/{id}`) must have at least two participants, one of whom must be the creator.
4. Notifications are either private (linked to a `userId`) or system-wide (null `userId`).
5. Only managers/admins can approve/reject requests or edit other users' attendance.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Create a user document with a different UID.
2. **Privilege Escalation**: Update own role to 'manager'.
3. **Orphaned Attendance**: Create attendance for a non-existent user.
4. **State Shortcutting**: Update a request status to 'approved' as a regular employee.
5. **Ghost Field Injection**: Add `isAdmin: true` to a user document.
6. **Large Payload Attack**: Send a 1MB string in the `displayName` field.
7. **Invalid ID Poisoning**: Use `../../etc/passwd` as a document ID.
8. **Unauthorized List**: Query all attendance records without a filter as an employee.
9. **Chat Eavesdropping**: Read messages in a chat where the user is not a participant.
10. **Notification Spam**: Create notifications for other users.
11. **Immortal Field Update**: Change `createdAt` after document creation.
12. **System Field Poisoning**: Update an automated deduction log as a user.

## The Test Runner (Plan)
We will use `firebase-framework` and `vitest` or similar to verify these rules if the environment allows, but for now we focus on writing the hardened rules.
