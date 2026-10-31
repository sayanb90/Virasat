Feature: Hardening: limits, lost phones, passwords, stronger keys and alerts
  As an Owner who keeps everything my family will need in Virasat
  I want strangers slowed down, lost phones cut off, and my account to warn me in time
  And I want my password to stay mine to change, and harder to guess as the years go by

  # the Development plan page (Notion), phase 5.

  Background:
    Given a fresh sign-in service

  # ── Limits per network ────────────────────────────────────────────────

  Scenario: One network trying many accounts is slowed down, and others are not
    When a script tries 21 sign-ins for different accounts from one network
    Then the first 20 are answered and the 21st is refused with status 429
    And it is told how long to wait
    And a sign-in from another network is still answered

  # ── A lost phone ──────────────────────────────────────────────────────

  Scenario: A lost phone is removed from another, and its PIN stops working
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on a new phone
    And she enters the code from her email
    And she sets up Face ID and PIN "482915" on the new phone
    Then her phones list shows 2 phones, with the new one marked as this phone
    When from the new phone she removes the first phone
    Then her phones list shows 1 phone
    And the first phone has no share of its PIN key on the server
    And signing in on the first phone needs a code from her email, as for a phone never seen

  Scenario: A phone cannot remove itself from the list
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she removes this phone from its own phones list
    Then the answer is refused with status 400

  # ── Changing the password ─────────────────────────────────────────────

  Scenario: Changing the password keeps the same vault, and says so by email
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she changes her password from "Mango-Tree-Rain-42" to "Brand-New-Password-7"
    Then a "Your Virasat password was changed" email was sent to "meera@example.com"
    And she can sign in with "Brand-New-Password-7" and open the same vault
    And she cannot sign in with "Mango-Tree-Rain-42"

  Scenario: Changing the password needs the current one, even with the vault open
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she changes her password from "not-her-password" to "Brand-New-Password-7"
    Then the answer is refused with status 403
    And she can sign in with "Mango-Tree-Rain-42" and open the same vault

  # ── Stronger keys ─────────────────────────────────────────────────────

  Scenario: A new account's password is stretched with Argon2id
    When "meera@example.com" signs up on a phone with password "Mango-Tree-Rain-42"
    Then her account uses Argon2id with 64 MiB

  Scenario: An older account moves to Argon2id at its next sign-in, without her noticing
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    And her account still uses the older PBKDF2 settings
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she confirms with Face ID
    And the app moves her account to the new settings
    Then her account uses Argon2id with 64 MiB
    And she can sign in with "Mango-Tree-Rain-42" and open the same vault
    And no "Your Virasat password was changed" email was sent

  Scenario: Someone with only the password cannot replace her keys
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    And her account still uses the older PBKDF2 settings
    When someone signs in with her password on a phone of their own
    And they try to move her account to settings of their choosing
    Then the answer is refused with status 403
    And her account still uses PBKDF2

  # ── Alerts ────────────────────────────────────────────────────────────

  Scenario: Her phone is alerted when someone starts a recovery, without saying what Virasat holds
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    And her phone has alerts turned on
    When someone starts a recovery for "meera@example.com" with her Recovery Kit
    Then her phone was alerted once
    And the alert names no person, address or note

  Scenario: A removed phone is not alerted
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    And her phone has alerts turned on
    When she signs in with password "Mango-Tree-Rain-42" on a new phone
    And she enters the code from her email
    And she sets up Face ID and PIN "482915" on the new phone
    And from the new phone she removes the first phone
    And someone starts a recovery for "meera@example.com" with her Recovery Kit
    Then no phone was alerted
