Feature: Zero-Knowledge Client Cryptography Specification
  As a Virasat vault owner
  I want client-side WebCrypto encryption for all passwords, notes, and file attachments
  So that master keys and plaintext secrets never touch the server or platform database

  Scenario: Derive Master Key K_master via PBKDF2 SHA-256 with 100,000 iterations
    Given a user passphrase "VirasatMaster2026!#" and a salt hex "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2"
    When the WebCrypto PBKDF2 key derivation is executed
    Then a 256-bit AES-GCM Master Key K_master should be derived
    And the key should be extractable for in-memory volatile session storage

  Scenario: Encrypt and decrypt a structured vault item with AES-256-GCM
    Given a valid master key K_master
    And plaintext secret notes "Master seed phrase: apple banana cherry"
    When the payload is encrypted using AES-256-GCM with a 12-byte random IV
    Then the result should contain a ciphertext hex string and IV hex string
    And decrypting the ciphertext hex with K_master and IV hex should restore "Master seed phrase: apple banana cherry"

  Scenario: Asymmetric RSA envelope encryption for designated beneficiaries
    Given a beneficiary with an RSA-OAEP 2048-bit public key
    And a generated 256-bit Chest Key K_chest
    When K_chest is envelope encrypted with the beneficiary's public key
    Then the resulting envelope string E_ben(K_chest) should be produced
    And only the beneficiary's RSA private key should be able to decrypt K_chest

  # The crypto modules used to log the full salt and a 16-hex-char prefix of
  # K_master to the console on every unlock. In a shipped build that writes
  # key material into devtools and into any console-capturing error reporter,
  # and salt + key prefix is an oracle for confirming a guessed passphrase
  # offline. This scenario fails the moment a secret is logged again.
  Scenario: Deriving and using a key never writes key material to the console
    Given the console is being recorded
    And a user passphrase "VirasatMaster2026!#" and a salt hex "e4f81c90a1b2c3d4e5f6a7b8c9d0e1f2"
    When the WebCrypto PBKDF2 key derivation is executed
    And a chest key is generated, exported and re-imported
    Then the console output should not contain the salt
    And the console output should not contain the master key
    And the console output should not contain the passphrase
    And the console output should not contain any chest key material
