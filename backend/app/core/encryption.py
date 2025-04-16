import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def generate_salt() -> str:
    """Generate a random salt and return as base64 string"""
    salt = os.urandom(16)  # 16 bytes = 128 bits
    return base64.b64encode(salt).decode('utf-8')


def encrypt_data(data: str, key: bytes, salt: str = None) -> tuple:
    """
    Encrypt data using AES-GCM
    Returns (ciphertext, salt) tuple
    """
    if salt is None:
        salt = generate_salt()
    else:
        # Ensure salt is in the right format
        if isinstance(salt, str):
            salt_bytes = base64.b64decode(salt)
        else:
            salt_bytes = salt
            salt = base64.b64encode(salt_bytes).decode('utf-8')
    
    # Generate a random nonce
    nonce = os.urandom(12)  # 12 bytes is recommended for AES-GCM
    
    # Create an AES-GCM cipher with the derived key
    aesgcm = AESGCM(key)
    
    # Encrypt the data
    ciphertext = aesgcm.encrypt(
        nonce,
        data.encode('utf-8'),
        salt_bytes  # Use salt as associated data for added security
    )
    
    # Combine nonce and ciphertext for storage
    encrypted_data = base64.b64encode(nonce + ciphertext).decode('utf-8')
    
    return encrypted_data, salt


def decrypt_data(encrypted_data: str, key: bytes, salt: str) -> str:
    """Decrypt data using AES-GCM"""
    # Decode the base64 encrypted data
    data = base64.b64decode(encrypted_data)
    
    # Split nonce and ciphertext
    nonce = data[:12]
    ciphertext = data[12:]
    
    # Decode the salt
    salt_bytes = base64.b64decode(salt)
    
    # Create an AES-GCM cipher with the derived key
    aesgcm = AESGCM(key)
    
    # Decrypt the data
    plaintext = aesgcm.decrypt(
        nonce,
        ciphertext,
        salt_bytes  # Associated data used during encryption
    )
    
    return plaintext.decode('utf-8')