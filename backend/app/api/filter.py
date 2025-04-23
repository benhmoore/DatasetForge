from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
import re
import logging
from ..db import get_session
from ..core.security import get_current_user
from ..api.models import User

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/filter/preview")
async def preview_filter_rules(
    request: Dict[str, Any],
    user: User = Depends(get_current_user)
):
    """
    Preview filter rule evaluation against sample text
    """
    try:
        text = request.get("text", "")
        rules = request.get("rules", [])
        combination_mode = request.get("combination_mode", "AND")
        
        if not text:
            return {
                "passed": False,
                "error": "No input text provided for preview",
                "ruleResults": []
            }
        
        if not rules:
            return {
                "passed": True,
                "ruleResults": [],
                "message": "No rules to evaluate"
            }
        
        # Evaluate each rule
        rule_results = []
        for rule in rules:
            if rule.get("enabled", True):
                result = evaluate_rule(text, rule)
                rule_results.append(result)
        
        # Determine overall pass/fail based on combination mode
        if combination_mode == "AND":
            passed = all(result["passed"] for result in rule_results)
        else:  # "OR"
            passed = any(result["passed"] for result in rule_results)
        
        return {
            "passed": passed,
            "ruleResults": rule_results
        }
        
    except Exception as e:
        logger.exception(f"Error evaluating filter rules: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating filter rules: {str(e)}"
        )

def evaluate_rule(text: str, rule: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluate a single filter rule against text input
    """
    rule_type = rule.get("type")
    parameters = rule.get("parameters", {})
    
    # Get human-readable rule name for results
    rule_name = get_rule_name(rule_type, parameters)
    
    try:
        # Evaluate based on rule type
        if rule_type == "min_length":
            return evaluate_min_length(text, parameters, rule_name)
        elif rule_type == "max_length":
            return evaluate_max_length(text, parameters, rule_name)
        elif rule_type == "contains":
            return evaluate_contains(text, parameters, rule_name)
        elif rule_type == "not_contains":
            return evaluate_not_contains(text, parameters, rule_name)
        elif rule_type == "regex_match":
            return evaluate_regex_match(text, parameters, rule_name)
        elif rule_type == "no_passive_voice":
            return evaluate_passive_voice(text, parameters, rule_name)
        elif rule_type == "sentence_structure":
            return evaluate_sentence_structure(text, parameters, rule_name)
        elif rule_type == "spelling_check":
            return evaluate_spelling(text, parameters, rule_name)
        elif rule_type == "readability_score":
            return evaluate_readability(text, parameters, rule_name)
        elif rule_type == "sentence_length":
            return evaluate_sentence_length(text, parameters, rule_name)
        elif rule_type == "formality_level":
            return evaluate_formality(text, parameters, rule_name)
        
        # Default fallback
        return {
            "ruleName": rule_name,
            "passed": False,
            "message": f"Unknown rule type: {rule_type}"
        }
        
    except Exception as e:
        logger.exception(f"Error evaluating rule {rule_type}: {e}")
        return {
            "ruleName": rule_name,
            "passed": False,
            "message": f"Error evaluating rule: {str(e)}"
        }

def get_rule_name(rule_type: str, parameters: Dict[str, Any]) -> str:
    """Get a human-readable name for the rule"""
    if rule_type == "min_length":
        unit = parameters.get("unit", "characters")
        value = parameters.get("value", 0)
        return f"Minimum {value} {unit}"
    elif rule_type == "max_length":
        unit = parameters.get("unit", "characters")
        value = parameters.get("value", 0)
        return f"Maximum {value} {unit}"
    elif rule_type == "contains":
        text = parameters.get("text", "")
        return f"Contains '{text}'"
    elif rule_type == "not_contains":
        text = parameters.get("text", "")
        return f"Does not contain '{text}'"
    elif rule_type == "regex_match":
        pattern = parameters.get("pattern", "")
        return f"Matches pattern '{pattern}'"
    elif rule_type == "no_passive_voice":
        return "No passive voice"
    elif rule_type == "sentence_structure":
        return "Sentence structure"
    elif rule_type == "spelling_check":
        language = parameters.get("language", "en")
        return f"Spelling check ({language})"
    elif rule_type == "readability_score":
        min_score = parameters.get("min_score", 0)
        method = parameters.get("method", "flesch_kincaid")
        return f"Readability score >= {min_score} ({method})"
    elif rule_type == "sentence_length":
        max_length = parameters.get("max_length", 0)
        unit = parameters.get("unit", "words")
        return f"Sentence length <= {max_length} {unit}"
    elif rule_type == "formality_level":
        min_level = parameters.get("min_level", "medium")
        return f"Formality level >= {min_level}"
    # Add other rule types as needed
    return rule_type.replace("_", " ").title()

# Rule evaluation functions

def evaluate_min_length(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """Evaluate minimum length rule"""
    value = parameters.get("value", 0)
    unit = parameters.get("unit", "characters")
    
    if unit == "characters":
        actual = len(text)
    elif unit == "words":
        actual = len(text.split())
    elif unit == "sentences":
        # Simple sentence splitting - can be improved
        actual = len([s for s in re.split(r'[.!?]+', text) if s.strip()])
    else:
        actual = 0
    
    passed = actual >= value
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Text has {actual} {unit}, but {value} are required",
        "actual": actual,
        "required": value
    }

def evaluate_max_length(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """Evaluate maximum length rule"""
    value = parameters.get("value", 0)
    unit = parameters.get("unit", "characters")
    
    if unit == "characters":
        actual = len(text)
    elif unit == "words":
        actual = len(text.split())
    elif unit == "sentences":
        # Simple sentence splitting - can be improved
        actual = len([s for s in re.split(r'[.!?]+', text) if s.strip()])
    else:
        actual = 0
    
    passed = actual <= value
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Text has {actual} {unit}, but maximum is {value}",
        "actual": actual,
        "maximum": value
    }

def evaluate_contains(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """Evaluate contains rule"""
    search_text = parameters.get("text", "")
    case_sensitive = parameters.get("case_sensitive", False)
    
    if not search_text:
        return {
            "ruleName": rule_name,
            "passed": True,
            "message": "No search text specified"
        }
    
    if case_sensitive:
        found = search_text in text
    else:
        found = search_text.lower() in text.lower()
    
    return {
        "ruleName": rule_name,
        "passed": found,
        "message": None if found else f"Text does not contain '{search_text}'"
    }

def evaluate_not_contains(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """Evaluate not_contains rule"""
    search_text = parameters.get("text", "")
    case_sensitive = parameters.get("case_sensitive", False)
    
    if not search_text:
        return {
            "ruleName": rule_name,
            "passed": True,
            "message": "No search text specified"
        }
    
    if case_sensitive:
        found = search_text in text
    else:
        found = search_text.lower() in text.lower()
    
    return {
        "ruleName": rule_name,
        "passed": not found,
        "message": None if not found else f"Text contains '{search_text}'"
    }

def evaluate_regex_match(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """Evaluate regex_match rule"""
    pattern = parameters.get("pattern", "")
    
    if not pattern:
        return {
            "ruleName": rule_name,
            "passed": True,
            "message": "No pattern specified"
        }
    
    try:
        matches = re.findall(pattern, text)
        passed = len(matches) > 0
        
        return {
            "ruleName": rule_name,
            "passed": passed,
            "message": None if passed else f"Text does not match pattern '{pattern}'",
            "matches": matches[:5] if passed else []  # Show up to 5 matches
        }
    except re.error as e:
        return {
            "ruleName": rule_name,
            "passed": False,
            "message": f"Invalid regular expression: {str(e)}"
        }

def evaluate_passive_voice(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """
    Evaluate text for passive voice constructions
    This is a simplified implementation - a full implementation would use a proper NLP library
    """
    # Simple regex pattern to detect common passive voice constructions
    # This is a simplified approach - a full implementation would use spaCy
    passive_patterns = [
        r'\b(?:am|is|are|was|were|be|being|been)\s+(\w+ed)\b',
        r'\b(?:am|is|are|was|were|be|being|been)\s+(\w+en)\b',
    ]
    
    passive_constructions = []
    
    # Find all passive voice constructions
    for pattern in passive_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            # Extract the sentence containing the match
            sentence_start = text.rfind('.', 0, match.start()) + 1
            if sentence_start == 0:
                sentence_start = text.rfind('!', 0, match.start()) + 1
            if sentence_start == 0:
                sentence_start = text.rfind('?', 0, match.start()) + 1
            if sentence_start == 0:
                sentence_start = 0
                
            sentence_end = text.find('.', match.end())
            if sentence_end == -1:
                sentence_end = text.find('!', match.end())
            if sentence_end == -1:
                sentence_end = text.find('?', match.end())
            if sentence_end == -1:
                sentence_end = len(text)
                
            sentence = text[sentence_start:sentence_end].strip()
            passive_constructions.append(sentence)
    
    # Get max allowed occurrences
    max_occurrences = parameters.get("max_occurrences", 0)
    
    passed = len(passive_constructions) <= max_occurrences
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Found {len(passive_constructions)} instances of passive voice",
        "instances": passive_constructions[:3],  # Show up to 3 examples
        "count": len(passive_constructions)
    }

def evaluate_sentence_structure(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """
    Evaluate sentence structure - this is a simplified implementation
    Checks for basic sentence structure issues
    """
    # Split text into sentences
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    
    # List to store issues found
    issues = []
    
    strictness = parameters.get("strictness", "medium")
    
    # Apply different checks based on strictness level
    for sentence in sentences:
        # Basic checks (applied at all strictness levels)
        if not sentence[0].isupper():
            issues.append(f"Sentence does not start with capital letter: '{sentence[:20]}...'")
            
        # For medium strictness, add more checks
        if strictness in ["medium", "high"]:
            # Check for run-on sentences (simple approximation via length)
            words = sentence.split()
            if len(words) > 30:  # Arbitrary threshold
                issues.append(f"Possible run-on sentence ({len(words)} words): '{sentence[:30]}...'")
                
        # For high strictness, add even more checks
        if strictness == "high":
            # Check for repeated words
            words = sentence.lower().split()
            for i in range(1, len(words)):
                if words[i] == words[i-1] and words[i] not in ["the", "a", "an"]:  # ignore some common repeats
                    issues.append(f"Repeated word '{words[i]}' in: '{sentence[:30]}...'")
    
    # Determine pass/fail based on issues found
    passed = len(issues) == 0
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Found {len(issues)} sentence structure issues",
        "issues": issues[:3],  # Show up to 3 issues
        "count": len(issues)
    }

def evaluate_spelling(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """
    Simple simulation of spelling check - actual implementation would use a spell check library
    """
    # This is a simplified implementation - a real one would use a proper spell checker API
    # For demo purposes, we'll just check against a tiny dictionary of commonly misspelled words
    
    common_misspellings = {
        "accomodate": "accommodate",
        "acheive": "achieve",
        "accross": "across",
        "agressive": "aggressive",
        "apparant": "apparent",
        "begining": "beginning",
        "beleive": "believe",
        "definate": "definite",
        "dissapoint": "disappoint",
        "existance": "existence",
        "foriegn": "foreign",
        "goverment": "government",
        "grammer": "grammar",
        "occured": "occurred",
        "recieve": "receive",
        "seperate": "separate",
        "suprise": "surprise",
        "tommorrow": "tomorrow",
        "wierd": "weird"
    }
    
    # Extract words and normalize
    words = re.findall(r'\b\w+\b', text.lower())
    
    # Find misspellings
    misspelled = []
    language = parameters.get("language", "en")
    mode = parameters.get("mode", "standard")
    
    # Only check English for our simple demo
    if language == "en":
        # Apply different strictness based on mode
        strict_check = mode == "strict"
        relaxed_check = mode == "relaxed"
        
        for word in words:
            if word in common_misspellings:
                correction = common_misspellings[word]
                misspelled.append(f"'{word}' should be '{correction}'")
    
    # Determine pass/fail based on misspellings found
    passed = len(misspelled) == 0
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Found {len(misspelled)} spelling errors",
        "misspelled": misspelled[:5],  # Show up to 5 misspelled words
        "count": len(misspelled)
    }

def evaluate_readability(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """
    Calculate readability score using the specified method
    """
    min_score = parameters.get("min_score", 60)
    method = parameters.get("method", "flesch_kincaid")
    
    # Count sentences, words, and syllables
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    sentence_count = len(sentences)
    if sentence_count == 0:  # Avoid division by zero
        sentence_count = 1
    
    words = re.findall(r'\b\w+\b', text.lower())
    word_count = len(words)
    if word_count == 0:  # Avoid division by zero
        word_count = 1
    
    # Simple syllable counting (very approximate)
    def count_syllables(word):
        # Count vowel groups as syllables (very rough approximation)
        return len(re.findall(r'[aeiouy]+', word.lower())) or 1
    
    syllable_count = sum(count_syllables(word) for word in words)
    
    # Calculate score based on method
    score = 0
    
    if method == "flesch_kincaid":
        # Flesch Reading Ease score (higher is easier to read)
        # Formula: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
        score = 206.835 - 1.015 * (word_count / sentence_count) - 84.6 * (syllable_count / word_count)
        # Clamp score to 0-100 range
        score = max(0, min(100, score))
    
    elif method == "coleman_liau":
        # Coleman-Liau Index (approximation)
        # Formula: 0.0588 * L - 0.296 * S - 15.8
        # where L is avg number of characters per 100 words and S is avg number of sentences per 100 words
        char_count = len(re.sub(r'\s', '', text))
        L = char_count / word_count * 100
        S = sentence_count / word_count * 100
        # Convert to a 0-100 scale where higher is easier to read
        grade_level = 0.0588 * L - 0.296 * S - 15.8
        score = max(0, min(100, 100 - (grade_level * 5)))  # Convert grade level to 0-100 scale
    
    elif method == "gunning_fog":
        # Gunning Fog Index (approximation)
        # Count complex words (>2 syllables, simplified)
        complex_words = sum(1 for word in words if count_syllables(word) > 2)
        complex_word_percentage = complex_words / word_count * 100
        # Formula: 0.4 * ((words/sentences) + 100 * (complex words/words))
        grade_level = 0.4 * ((word_count / sentence_count) + 0.4 * (complex_word_percentage))
        # Convert to a 0-100 scale where higher is easier to read
        score = max(0, min(100, 100 - (grade_level * 5)))  # Convert grade level to 0-100 scale
    
    passed = score >= min_score
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Readability score is {score:.1f}, but minimum required is {min_score}",
        "score": round(score, 1),
        "min_score": min_score,
        "method": method
    }

def evaluate_sentence_length(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """
    Check sentence length against maximum allowed
    """
    max_length = parameters.get("max_length", 30)
    unit = parameters.get("unit", "words")
    
    # Split text into sentences
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    
    # List to store sentences that exceed the maximum length
    too_long = []
    
    for sentence in sentences:
        if unit == "words":
            length = len(sentence.split())
        else:  # characters
            length = len(sentence)
            
        if length > max_length:
            # Truncate very long sentences in the output
            display_sentence = sentence[:50] + "..." if len(sentence) > 50 else sentence
            too_long.append(f"({length} {unit}) {display_sentence}")
    
    passed = len(too_long) == 0
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Found {len(too_long)} sentences exceeding {max_length} {unit}",
        "too_long": too_long[:3],  # Show up to 3 examples
        "count": len(too_long)
    }

def evaluate_formality(text: str, parameters: Dict[str, Any], rule_name: str) -> Dict[str, Any]:
    """
    Evaluate text formality level
    This is a simplified implementation - a full implementation would use ML models
    """
    min_level = parameters.get("min_level", "medium")
    strictness = parameters.get("strictness", "medium")
    
    # Convert min_level to numeric scale (1-3)
    level_map = {"low": 1, "medium": 2, "high": 3}
    min_level_score = level_map.get(min_level, 2)
    
    # Markers of informality
    informal_markers = [
        r'\b(?:gonna|gotta|wanna|dunno|ain\'t)\b',  # Informal contractions
        r'\b(?:awesome|cool|super|totally|really|basically)\b',  # Informal modifiers
        r'\b(?:stuff|thing|guy|OK|okay)\b',  # Informal nouns
        r'\b(?:like|um|uh|er)\b',  # Filler words
        r'!{2,}',  # Multiple exclamation marks
        r'\?{2,}',  # Multiple question marks
        r'\.{3,}',  # Ellipses (could be formal or informal depending on usage)
    ]
    
    # Markers of formality
    formal_markers = [
        r'\b(?:subsequently|accordingly|consequently|therefore|furthermore|moreover)\b',  # Formal transitions
        r'\b(?:utilize|implement|establish|demonstrate|indicate)\b',  # Formal verbs
        r'\b(?:appropriate|significant|substantial|adequate|considerable)\b',  # Formal modifiers
        r'\b(?:analysis|methodology|implementation|assessment|evaluation)\b',  # Formal nouns
    ]
    
    # Count occurrences
    informal_count = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in informal_markers)
    formal_count = sum(len(re.findall(pattern, text, re.IGNORECASE)) for pattern in formal_markers)
    
    # Word count for normalization
    word_count = len(re.findall(r'\b\w+\b', text))
    if word_count == 0:  # Avoid division by zero
        word_count = 1
    
    # Calculate formality score (0-3 scale)
    informal_ratio = informal_count / word_count
    formal_ratio = formal_count / word_count
    
    # Adjust baselines based on strictness
    if strictness == "low":
        base_score = 2.0  # Give benefit of doubt
    elif strictness == "medium":
        base_score = 1.5  # Neutral baseline
    else:  # high
        base_score = 1.0  # Strict baseline
    
    # Calculate score
    formality_score = base_score + formal_ratio * 10 - informal_ratio * 15
    
    # Clamp to 0-3 range
    formality_score = max(0, min(3, formality_score))
    
    # Determine level
    if formality_score < 1:
        level = "low"
        level_value = 1
    elif formality_score < 2:
        level = "medium"
        level_value = 2
    else:
        level = "high"
        level_value = 3
    
    passed = level_value >= min_level_score
    
    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": None if passed else f"Text formality level is '{level}', but minimum required is '{min_level}'",
        "level": level,
        "required": min_level,
        "score": round(formality_score, 1)
    }