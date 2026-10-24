Feature: Signing in, unlocking and recovery
  As an Owner whose notes only I can read
  I want every sign-in to need two things, checked by the server
  And I want a way back in that does not hand our server my vault

  # docs/authentication.md. These run the real flows and the real device-side
  # crypto together: the "phone" in each scenario derives keys, wraps K_vault
  # and signs challenges exactly as the app does.

  Background:
    Given a fresh sign-in service

  # ── What the server holds ─────────────────────────────────────────────

  Scenario: Signing up never gives the server the password or the vault key
    When "meera@example.com" signs up on a phone with password "Mango-Tree-Rain-42"
    Then the server's records contain neither the password nor the vault key
    And the server can only verify the login proof, not reuse it

  Scenario: Asking for the salt does not reveal who has an account
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    Then the salt for "nobody@example.com" looks exactly like a real one
    And the salt for "nobody@example.com" is the same every time

  # ── Tier one, then tier two ───────────────────────────────────────────

  Scenario: A password on a phone already set up still needs Face ID
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    Then her session is pending and needs "device"
    When she confirms with Face ID
    Then her session is full
    And she has a refresh token

  Scenario: A modified app cannot skip Face ID
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    And the app answers the challenge with a key that is not this phone's
    Then the answer is refused with status 401
    And her session is pending and needs "device"

  Scenario: A wrong password and an unknown email get the same answer
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When someone signs in as "meera@example.com" with password "wrong-password-1"
    And someone signs in as "nobody@example.com" with password "wrong-password-1"
    Then both attempts got the same status and message

  Scenario: Five wrong passwords lock the address for a while
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When someone tries 5 wrong passwords for "meera@example.com"
    And she signs in with password "Mango-Tree-Rain-42" on the same phone
    Then the answer is refused with status 429

  # ── A new phone (3.4) ─────────────────────────────────────────────────

  Scenario: A new phone needs the password and a code from the email
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on a new phone
    Then her session is pending and needs "email-code"
    And a "new-device" code was emailed to "meera@example.com"
    When she enters a wrong code
    Then her session is pending and needs "email-code"
    When she enters the code from her email
    Then her session is full
    When she sets up Face ID and PIN "482915" on the new phone
    Then a "A new phone signed in to Virasat" email was sent to "meera@example.com"
    And the new phone can open her vault

  # ── The PIN (§4) ──────────────────────────────────────────────────────

  Scenario: The right PIN opens the phone's copy of the vault key
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she confirms with PIN "482915"
    Then her session is full
    And the PIN copy on the phone opens her vault

  Scenario: The phone alone cannot open its PIN copy of the vault key
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    Then the phone's PIN copy cannot be opened without the server's share

  Scenario: Five wrong PINs lock the PIN for good
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she enters 5 wrong PINs
    And she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she confirms with PIN "482915"
    Then the answer is refused with status 423
    And the server no longer holds a share for that phone

  # ── Staying signed in ─────────────────────────────────────────────────

  Scenario: A remembered sign-in still asks for Face ID
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When the app reopens with its refresh token
    Then her session is pending and needs "device"

  Scenario: A copied refresh token ends the sign-in everywhere
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When the app reopens with its refresh token
    And someone else replays the same refresh token
    Then the answer is refused with status 401
    And the app's newer refresh token no longer works

  # ── Social sign-in (3.2, 3.5) ─────────────────────────────────────────

  Scenario: Signing up with Google takes name and email, then still asks for a password
    When a new person continues with "google" as "anil@example.com" named "Anil Rao"
    Then they are asked to sign up as "anil@example.com" named "Anil Rao" without an email code
    When they choose password "Banyan-Leaf-Kite-7" and finish on a phone
    Then "anil@example.com" has a "google" identity
    When they continue with "google" again on the same phone
    Then the social sign-in needs "device"

  Scenario: The provider alone is not enough on a new phone
    Given "anil@example.com" has signed up with "google" on a phone with password "Banyan-Leaf-Kite-7"
    When they continue with "google" again on a new phone
    Then the social sign-in asks for the password

  Scenario: A social account is never linked on email alone
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When a new person continues with "apple" as "meera@example.com" named "Meera"
    Then the social sign-in asks for the password to link
    When she links it with password "wrong-password-1"
    Then "meera@example.com" has no "apple" identity
    When a new person continues with "apple" as "meera@example.com" named "Meera"
    And she links it with password "Mango-Tree-Rain-42"
    Then "meera@example.com" has a "apple" identity

  Scenario: A provider token cannot be replayed into another sign-in
    When a new person continues with "google" as "anil@example.com" named "Anil Rao"
    And the same provider token is presented again
    Then the answer is refused with status 400

  Scenario: Facebook without an email has to confirm one
    When a new person continues with "facebook" without an email, named "Ravi"
    Then they are asked to sign up and confirm an email
    When they confirm "ravi@example.com" with the emailed code
    And they choose password "Lotus-Pond-Drum-3" and finish on a phone
    Then "ravi@example.com" has a "facebook" identity

  # ── Forgotten password (3.6) ──────────────────────────────────────────

  Scenario: Path A — the phone still works
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she forgets her password and starts again on the same phone
    Then her session is pending and needs "device, email-code"
    When she confirms with Face ID
    And she enters the "reset" code from her email
    And she chooses the new password "Peacock-Feather-Blue-9"
    Then she can sign in with "Peacock-Feather-Blue-9" and open the same vault
    And she cannot sign in with "Mango-Tree-Rain-42"

  Scenario: Path B — the Recovery Kit, with a 72-hour hold the Owner can stop
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When someone starts a recovery for "meera@example.com" with her Recovery Kit
    Then a "Someone is recovering your Virasat account" email was sent to "meera@example.com"
    And the recovery cannot be completed yet
    When the Owner taps the link in that email
    And 72 hours pass
    Then the recovery cannot be completed because it has ended

  Scenario: Path B — after 72 hours the kit opens the same vault, and is spent
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When someone starts a recovery for "meera@example.com" with her Recovery Kit
    And 71 hours pass
    Then the recovery cannot be completed yet
    When 1 hours pass
    And the recovery is completed with the new password "Peacock-Feather-Blue-9"
    Then she can sign in with "Peacock-Feather-Blue-9" and open the same vault
    And her old Recovery Kit no longer starts a recovery

  Scenario: A wrong recovery code starts nothing
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When someone starts a recovery for "meera@example.com" with a made-up code
    Then the answer is refused with status 401
    And no recovery email was sent to "meera@example.com"
