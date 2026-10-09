Feature: Safety Settings and Backup
  As someone trusting Virasat with my family's instructions
  I want my check-in interval to really change the schedule
  And I want a backup I can restore without ever exposing my notes

  Scenario: The default cycle keeps the original one-year schedule
    Given a check-in cycle of 365 days
    Then silence should last 270 days
    And the full cycle should be 365 days

  Scenario: A shorter cycle scales the whole escalation, not just the end
    Given a check-in cycle of 183 days
    Then silence should last 135 days
    And gentle reminders should begin before urgent ones

  Scenario: A longer cycle scales the same way
    Given a check-in cycle of 730 days
    Then silence should last 540 days
    And the full cycle should be 730 days

  Scenario: The escalation phase follows the configured cycle
    Given a check-in cycle of 183 days
    When 140 days have passed without a check-in
    Then the safety state should have left the silent period

  Scenario: The same elapsed time is still silent on a longer cycle
    Given a check-in cycle of 730 days
    When 140 days have passed without a check-in
    Then the safety state should still be in the silent period

  Scenario: A backup carries ciphertext only
    Given a note whose body was encrypted to "the locker key is with Meera"
    When a backup file is produced
    Then the backup should not contain the words "locker key"
    And the backup should keep the ciphertext and IV needed to restore it

  Scenario: A backup can be read back
    Given a note whose body was encrypted to "the locker key is with Meera"
    When a backup file is produced
    And the backup file is read back
    Then it should contain 1 note

  Scenario: A file that is not a Virasat backup is refused
    When a file that is not a backup is read back
    Then reading it should fail with a clear message
