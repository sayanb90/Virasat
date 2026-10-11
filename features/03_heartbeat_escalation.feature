Feature: Heartbeat & 5-Phase Escalation Engine
  As a Virasat user
  I want an automated state machine that operates silently for most of my chosen cycle
  And progressively escalates through gentle reminders, SMS/Email alerts, daily countdowns, and vault release if I do not check in
  And I want the same escalation shape whichever check-in interval I pick

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

  # The phase badge was already proportional to the chosen cycle, but the
  # notification log was pinned to the 365-day day numbers. A user on a
  # 6-month cycle could therefore sit in Phase 1 while the log claimed
  # nothing had been sent. These scenarios pin the schedule to the cycle.
  Scenario Outline: The notification schedule scales with the chosen cycle
    Given the user's check-in cycle is <cycle> days
    When simulated time advances to day <day> on that cycle
    Then the escalation state machine should transition to "<phase_name>"
    And the total dispatched notification count should be <notification_count>

    Examples: Six-month cycle
      | cycle | day | phase_name                                     | notification_count |
      | 183   | 100 | Phase 0: Silent Period                         | 0                  |
      | 183   | 140 | Phase 1: Gentle Reminders                      | 1                  |
      | 183   | 168 | Phase 2: Escalation                            | 8                  |
      | 183   | 175 | Phase 3: Critical Countdown                      | 16                 |
      | 183   | 184 | Phase 4: Vault Releasing / Escalation Triggered| 31                 |

    Examples: Two-year cycle
      | cycle | day | phase_name                                     | notification_count |
      | 730   | 200 | Phase 0: Silent Period                         | 0                  |
      | 730   | 560 | Phase 1: Gentle Reminders                      | 1                  |
      | 730   | 731 | Phase 4: Vault Releasing / Escalation Triggered| 31                 |

  # 31 is the whole ladder: 5 gentle + 5 urgent + 10 paired critical + the
  # release notice. Every cycle length must reach exactly the same total, or
  # the escalation is not really proportional.
  Scenario Outline: Every cycle length dispatches the whole ladder by its end
    Given the user's check-in cycle is <cycle> days
    When simulated time advances to day <cycle> on that cycle
    Then the total dispatched notification count should be 31
    And no alert should be dated beyond the end of the cycle

    Examples:
      | cycle |
      | 183   |
      | 365   |
      | 548   |
      | 730   |
