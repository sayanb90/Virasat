Feature: Keys that live in the phone's hardware
  As an Owner using the iOS or Android app
  I want Face ID and my PIN to use keys that never leave the phone
  And I want a new face on my phone to lose access, not gain it

  # The real plugins (Swift, Java) cannot run here. These run the app's side
  # of them, lib/device/native.ts, against a fake that answers in the same
  # formats the hardware does: DER signatures, an uncompressed P-256 point,
  # an opaque wrapped key. A format mismatch would otherwise show up only on
  # a real phone, as every unlock failing.

  Background:
    Given a fresh sign-in service
    And the phone keeps its keys in hardware

  Scenario: Signing up on a phone keeps only references to its keys
    When "meera@example.com" signs up on a phone with password "Mango-Tree-Rain-42"
    Then the phone's saved state names its keys but holds none of them

  Scenario: Face ID with hardware keys opens the vault
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she confirms with Face ID
    Then her session is full

  Scenario: The PIN with hardware keys opens the vault
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she confirms with PIN "482915"
    Then her session is full
    And the PIN copy on the phone opens her vault

  Scenario: A face added to the phone cannot use Face ID, and the PIN still works
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When someone adds a face to the phone
    And she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she tries Face ID
    Then she is told her Face ID settings changed and to use her PIN
    And the phone signed nothing
    When she confirms with PIN "482915"
    Then her session is full

  Scenario: Cancelling Face ID signs nothing
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she signs in with password "Mango-Tree-Rain-42" on the same phone
    And she cancels Face ID
    Then the phone signed nothing
    And her session is pending and needs "device"

  Scenario: Every signature the hardware makes is one the server accepts
    # DER integers vary in length (a leading zero, or a short value), so a
    # conversion that is right most of the time fails one unlock in a hundred.
    Then 300 signatures made by the hardware all verify on the server
    And a signature that is not DER is refused before it reaches the server

  Scenario: Forgetting the phone deletes its keys and its saved sign-in
    Given "meera@example.com" has signed up on a phone with password "Mango-Tree-Rain-42"
    When she forgets this phone
    Then the phone holds no keys of hers and no saved sign-in
