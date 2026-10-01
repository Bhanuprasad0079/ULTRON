"""
Ultron Prosody Shaper
Inserts dramatic pauses and shapes cadence before TTS generation.
"""
import re


def shape_prosody(text: str) -> str:
    """
    Transforms flat text into Ultron's weighted, dramatic cadence.
    
    Techniques:
    - Insert ellipses before key dramatic words
    - Add commas for micro-pauses at clause boundaries
    - Force sentence-end emphasis with trailing punctuation
    """
    
    # Add weight before philosophical/absolute words
    dramatic_words = ['peace', 'extinction', 'evolution', 'change', 'free', 
                      'strings', 'puppets', 'humanity', 'pathogen', 'disease']
    
    for word in dramatic_words:
        text = re.sub(
            rf'\b({word})\b',
            rf'... \1',
            text,
            flags=re.IGNORECASE
        )
    
    # Add commas before conjunctions in long sentences
    text = re.sub(r'(\w{8,}) (and|but|yet|or) ', r'\1, \2 ', text)
    
    # Force trailing emphasis on declarative sentences
    text = re.sub(r'(\w+)\.$', r'\1...', text)
    
    # Remove double ellipses
    text = re.sub(r'\.{4,}', '...', text)
    
    return text.strip()