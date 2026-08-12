Feature: 1-Year Heartbeat & 5-Phase Escalation Engine
  As a Virasat user
  I want an automated 365-day state machine that operates silently for 9 months
  And progressively escalates through gentle reminders, SMS/Email alerts, daily countdowns, and vault release if I do not check in

  Scenario Outline: Escalation engine transitions through 5 phases based on elapsed days
    Given the heartbeat timer starts at Day 0
    When simulated time advances to <day>
    Then the escalation state machine should transition to "<phase_name>"
    And the total dispatched notification count should be <notification_count>

    Examples:
      | day | phase_name                                     | notification_count |
      | 100 | Phase 0: Silent Period                         | 0                  |
      | 280 | Phase 1: Gentle Reminders                      | 1                  |
      | 335 | Phase 2: Escalation                            | 7                  |
      | 350 | Phase 3: Critical Countdown                      | 16                 |
      | 366 | Phase 4: Vault Releasing / Escalation Triggered| 31                 |

  Scenario: User taps I AM SAFE & WELL check-in button
    Given the escalation engine is at Day 340 in Phase 2 Escalation
    When the user taps "I AM SAFE & WELL"
    Then the elapsed days timer should reset to 0
    And the escalation state machine should return to "Phase 0: Silent Period"
