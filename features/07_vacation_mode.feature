Feature: Vacation Mode
  As someone who will be unreachable for a while
  I want to pause check-ins without being punished for it
  And I want the pause to be impossible to leave on forever

  Scenario: Six months is the longest pause allowed
    Then the longest allowed pause should be 183 days
    And the longest offered option should also be 183 days

  Scenario: Every offered option is within the cap
    Then no offered pause option should exceed the cap

  Scenario: Pausing stops the escalation clock
    Given the safety timer is at day 300
    When the user pauses for 30 days
    Then the account should be on vacation

  Scenario: Returning gives back the time that was paused
    Given the safety timer is at day 300
    When the user pauses for 30 days
    And 30 days go by and the user returns
    Then the safety timer should be back at day 270
    And the account should no longer be on vacation

  Scenario: Coming back early only gives back the days actually paused
    Given the safety timer is at day 300
    When the user pauses for 90 days
    And 10 days go by and the user returns
    Then the safety timer should be back at day 290

  Scenario: An expired pause noticed late credits only the pause itself
    Given the safety timer is at day 300
    When the user pauses for 14 days
    And 200 days go by and the user returns
    Then the safety timer should be back at day 286

  Scenario: The timer never goes below zero
    Given the safety timer is at day 5
    When the user pauses for 30 days
    And 30 days go by and the user returns
    Then the safety timer should be back at day 0
