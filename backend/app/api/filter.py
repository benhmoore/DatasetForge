from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
import re
import logging
import spacy  # Added import
from ..db import get_session

# Set up logging
logger = logging.getLogger(__name__)

# Load spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
    logger.info("spaCy model loaded successfully")
except Exception as e:
    logger.warning(
        f"Could not load spaCy model: {e}. Some grammar checks will use fallback methods."
    )
    SPACY_AVAILABLE = False
    nlp = None  # Ensure nlp is None if loading failed

router = APIRouter()


@router.post("/filter/preview")
async def preview_filter_rules(
    request: Dict[str, Any]
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
                "ruleResults": [],
            }

        if not rules:
            return {
                "passed": True,
                "ruleResults": [],
                "message": "No rules to evaluate",
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

        return {"passed": passed, "ruleResults": rule_results}

    except Exception as e:
        logger.exception(f"Error evaluating filter rules: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating filter rules: {str(e)}",
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
            # Assuming evaluate_passive_voice handles spaCy/fallback internally
            return evaluate_passive_voice(text, parameters, rule_name)
        elif rule_type == "sentence_structure":
            # Assuming evaluate_sentence_structure handles spaCy/fallback internally
            return evaluate_sentence_structure(text, parameters, rule_name)
        elif rule_type == "readability_score":
            # Assuming evaluate_readability handles spaCy/fallback internally
            return evaluate_readability(text, parameters, rule_name)
        # Removed spelling_check, sentence_length, formality_level based on prompt

        # Default fallback
        return {
            "ruleName": rule_name,
            "passed": False,
            "message": f"Unknown rule type: {rule_type}",
        }

    except Exception as e:
        logger.exception(f"Error evaluating rule {rule_type}: {e}")
        return {
            "ruleName": rule_name,
            "passed": False,
            "message": f"Error evaluating rule: {str(e)}",
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


def evaluate_min_length(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """Evaluate minimum length rule"""
    value = parameters.get("value", 0)
    unit = parameters.get("unit", "characters")

    if unit == "characters":
        actual = len(text)
    elif unit == "words":
        actual = len(text.split())
    elif unit == "sentences":
        # Simple sentence splitting - can be improved
        actual = len([s for s in re.split(r"[.!?]+", text) if s.strip()])
    else:
        actual = 0

    passed = actual >= value

    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": (
            None if passed else f"Text has {actual} {unit}, but {value} are required"
        ),
        "actual": actual,
        "required": value,
    }


def evaluate_max_length(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """Evaluate maximum length rule"""
    value = parameters.get("value", 0)
    unit = parameters.get("unit", "characters")

    if unit == "characters":
        actual = len(text)
    elif unit == "words":
        actual = len(text.split())
    elif unit == "sentences":
        # Simple sentence splitting - can be improved
        actual = len([s for s in re.split(r"[.!?]+", text) if s.strip()])
    else:
        actual = 0

    passed = actual <= value

    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": (
            None if passed else f"Text has {actual} {unit}, but maximum is {value}"
        ),
        "actual": actual,
        "maximum": value,
    }


def evaluate_contains(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """Evaluate contains rule"""
    search_text = parameters.get("text", "")
    case_sensitive = parameters.get("case_sensitive", False)

    if not search_text:
        return {
            "ruleName": rule_name,
            "passed": True,
            "message": "No search text specified",
        }

    if case_sensitive:
        found = search_text in text
    else:
        found = search_text.lower() in text.lower()

    return {
        "ruleName": rule_name,
        "passed": found,
        "message": None if found else f"Text does not contain '{search_text}'",
    }


def evaluate_not_contains(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """Evaluate not_contains rule"""
    search_text = parameters.get("text", "")
    case_sensitive = parameters.get("case_sensitive", False)

    if not search_text:
        return {
            "ruleName": rule_name,
            "passed": True,
            "message": "No search text specified",
        }

    if case_sensitive:
        found = search_text in text
    else:
        found = search_text.lower() in text.lower()

    return {
        "ruleName": rule_name,
        "passed": not found,
        "message": None if not found else f"Text contains '{search_text}'",
    }


def evaluate_regex_match(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """Evaluate regex_match rule"""
    pattern = parameters.get("pattern", "")

    if not pattern:
        return {
            "ruleName": rule_name,
            "passed": True,
            "message": "No pattern specified",
        }

    try:
        matches = re.findall(pattern, text)
        passed = len(matches) > 0

        return {
            "ruleName": rule_name,
            "passed": passed,
            "message": None if passed else f"Text does not match pattern '{pattern}'",
            "matches": matches[:5] if passed else [],  # Show up to 5 matches
        }
    except re.error as e:
        return {
            "ruleName": rule_name,
            "passed": False,
            "message": f"Invalid regular expression: {str(e)}",
        }


# Renamed original regex-based function
def evaluate_passive_voice_regex(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """Fallback regex-based passive voice detection"""
    # Simple regex pattern to detect common passive voice constructions
    passive_patterns = [
        r"\b(?:am|is|are|was|were|be|being|been)\s+(\w+ed)\b",
        r"\b(?:am|is|are|was|were|be|being|been)\s+(\w+en)\b",
    ]

    passive_constructions = []

    # Find all passive voice constructions
    for pattern in passive_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            # Extract the sentence containing the match (simplified extraction)
            sentence_start = max(0, text.rfind(".", 0, match.start()) + 1)
            sentence_end = text.find(".", match.end())
            if sentence_end == -1:
                sentence_end = len(text)

            sentence = text[sentence_start:sentence_end].strip()
            # Avoid adding duplicate sentences if multiple patterns match
            if sentence not in passive_constructions:
                passive_constructions.append(sentence)

    # Get max allowed occurrences
    max_occurrences = parameters.get("max_occurrences", 0)

    passed = len(passive_constructions) <= max_occurrences

    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": (
            None
            if passed
            else f"Found {len(passive_constructions)} instances of passive voice (regex fallback)"
        ),
        "instances": passive_constructions[:3],  # Show up to 3 examples
        "count": len(passive_constructions),
    }


# Enhanced passive voice detection with spaCy
def evaluate_passive_voice_spacy(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """
    Evaluate text for passive voice constructions using spaCy
    """
    if not SPACY_AVAILABLE or nlp is None:
        # Fallback to regex-based detection if spaCy is not available
        logger.warning(
            "Attempted spaCy passive voice check, but model not loaded. Falling back to regex."
        )
        return evaluate_passive_voice_regex(text, parameters, rule_name)

    max_occurrences = parameters.get("max_occurrences", 0)

    try:
        # Process the text with spaCy
        doc = nlp(text)

        # Find passive voice constructions
        passive_sentences = []

        for sent in doc.sents:
            passive_found_in_sent = False
            for token in sent:
                # Check for passive auxiliary verb dependency
                if token.dep_ == "auxpass":
                    passive_found_in_sent = True
                    break  # Found passive in this sentence, move to next sentence

            if passive_found_in_sent:
                passive_sentences.append(sent.text.strip())

        passed = len(passive_sentences) <= max_occurrences

        return {
            "ruleName": rule_name,
            "passed": passed,
            "message": (
                None
                if passed
                else f"Found {len(passive_sentences)} instances of passive voice (spaCy)"
            ),
            "instances": passive_sentences[:3],  # Show up to 3 examples
            "count": len(passive_sentences),
        }

    except Exception as e:
        logger.exception(f"Error in spaCy passive voice detection: {e}")
        # Fallback to regex-based detection on error
        logger.warning("Error during spaCy passive voice check. Falling back to regex.")
        return evaluate_passive_voice_regex(text, parameters, rule_name)


def evaluate_passive_voice(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    if SPACY_AVAILABLE and nlp:
        return evaluate_passive_voice_spacy(text, parameters, rule_name)
    else:
        logger.warning("spaCy not available, using regex for passive voice check.")
        return evaluate_passive_voice_regex(text, parameters, rule_name)


# Renamed original sentence structure function (or keep as is if no fallback desired)
def evaluate_sentence_structure_basic(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """
    Basic sentence structure checks (without spaCy)
    """
    # Split text into sentences
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]

    # List to store issues found
    issues = []

    strictness = parameters.get("strictness", "medium")

    # Apply different checks based on strictness level
    for sentence in sentences:
        # Basic checks (applied at all strictness levels)
        if sentence and not sentence[0].isupper():  # Check if sentence is not empty
            issues.append(
                f"Sentence does not start with capital letter: '{sentence[:20]}...'"
            )

        # For medium strictness, add more checks
        if strictness in ["medium", "high"]:
            # Check for run-on sentences (simple approximation via length)
            words = sentence.split()
            if len(words) > 30:  # Arbitrary threshold
                issues.append(
                    f"Possible run-on sentence ({len(words)} words): '{sentence[:30]}...'"
                )

        # For high strictness, add even more checks
        if strictness == "high":
            # Check for repeated words
            words = sentence.lower().split()
            for i in range(1, len(words)):
                if words[i] == words[i - 1] and words[i] not in [
                    "the",
                    "a",
                    "an",
                ]:  # ignore some common repeats
                    issues.append(
                        f"Repeated word '{words[i]}' in: '{sentence[:30]}...'"
                    )

    # Determine pass/fail based on issues found
    passed = len(issues) == 0

    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": (
            None
            if passed
            else f"Found {len(issues)} sentence structure issues (basic check)"
        ),
        "issues": issues[:3],  # Show up to 3 issues
        "count": len(issues),
    }


# Enhanced sentence structure evaluation with spaCy
def evaluate_sentence_structure_spacy(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """
    Evaluate sentence structure using spaCy
    """
    if not SPACY_AVAILABLE or nlp is None:
        logger.warning(
            "Attempted spaCy sentence structure check, but model not loaded. Skipping."
        )
        return {
            "ruleName": rule_name,
            "passed": True,  # Or False, depending on desired behavior
            "message": "Skipped: spaCy model not available for sentence structure analysis.",
        }

    strictness = parameters.get("strictness", "medium")

    try:
        # Process the text with spaCy
        doc = nlp(text)

        issues_found = []

        # Check each sentence
        for sent in doc.sents:
            # Skip very short sentences that might not be full sentences
            if len(sent) < 3:
                continue

            sentence_text = sent.text.strip()

            # 1. Check if sentence starts with a capital letter
            if sentence_text and not sentence_text[0].isupper():
                issues_found.append(
                    {
                        "sentence": (
                            sentence_text[:50] + "..."
                            if len(sentence_text) > 50
                            else sentence_text
                        ),
                        "issue": "Does not start with a capital letter.",
                    }
                )

            # 2. Check if sentence has a subject and a root verb
            has_subject = any(
                token.dep_ in ("nsubj", "nsubjpass", "csubj", "csubjpass")
                for token in sent
            )
            has_root_verb = any(
                token.dep_ == "ROOT" and token.pos_ == "VERB" for token in sent
            )

            if not (has_subject and has_root_verb):
                issues_found.append(
                    {
                        "sentence": (
                            sentence_text[:50] + "..."
                            if len(sentence_text) > 50
                            else sentence_text
                        ),
                        "issue": "Potentially missing subject or main verb.",
                    }
                )

            # 3. Additional checks for medium/high strictness
            if strictness in ("medium", "high"):
                # Check for potential run-on sentences (multiple root verbs might indicate this)
                root_verbs = [token for token in sent if token.dep_ == "ROOT"]
                # A simple check: more than one root verb without proper conjunction might be a run-on
                # This is a heuristic and might have false positives/negatives
                if len(root_verbs) > 1:
                    # Check if they are coordinated properly (e.g., with 'cc' like 'and', 'but')
                    is_coordinated = False
                    for token in sent:
                        if token.dep_ == "cc" and token.head in root_verbs:
                            is_coordinated = True
                            break
                    if not is_coordinated:
                        issues_found.append(
                            {
                                "sentence": (
                                    sentence_text[:50] + "..."
                                    if len(sentence_text) > 50
                                    else sentence_text
                                ),
                                "issue": "Possible run-on sentence (multiple main clauses detected).",
                            }
                        )

            # 4. High strictness adds more checks
            if strictness == "high":
                # Check for very long sentences (e.g., > 40 tokens)
                if len(sent) > 40:  # Token count, not characters
                    issues_found.append(
                        {
                            "sentence": (
                                sentence_text[:50] + "..."
                                if len(sentence_text) > 50
                                else sentence_text
                            ),
                            "issue": f"Sentence is very long ({len(sent)} tokens).",
                        }
                    )
                # Check for repeated words (excluding common stopwords)
                words = [
                    token.lemma_.lower()
                    for token in sent
                    if not token.is_punct and not token.is_stop
                ]
                for i in range(1, len(words)):
                    if words[i] == words[i - 1]:
                        issues_found.append(
                            {
                                "sentence": (
                                    sentence_text[:50] + "..."
                                    if len(sentence_text) > 50
                                    else sentence_text
                                ),
                                "issue": f"Repeated word: '{words[i]}'.",
                            }
                        )
                        break  # Only report first repeated word per sentence

        passed = len(issues_found) == 0

        return {
            "ruleName": rule_name,
            "passed": passed,
            "message": (
                None
                if passed
                else f"Found {len(issues_found)} potential sentence structure issues (spaCy)"
            ),
            "issues": issues_found[:5],  # Show up to 5 examples
            "count": len(issues_found),
        }

    except Exception as e:
        logger.exception(f"Error in spaCy sentence structure analysis: {e}")
        return {
            "ruleName": rule_name,
            "passed": True,  # Fail safe on error
            "message": f"Error analyzing sentence structure with spaCy: {str(e)}",
        }


def evaluate_sentence_structure(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    if SPACY_AVAILABLE and nlp:
        return evaluate_sentence_structure_spacy(text, parameters, rule_name)
    else:
        logger.warning("spaCy not available, skipping sentence structure check.")
        return evaluate_sentence_structure_basic(text, parameters, rule_name)


# Renamed original readability function
def evaluate_readability_regex(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """
    Calculate readability score using regex-based counts (fallback)
    """
    min_score = parameters.get("min_score", 60)
    method = parameters.get(
        "method", "flesch_kincaid"
    )  # Only Flesch Kincaid supported well here

    # Count sentences, words, and syllables using regex
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    sentence_count = max(1, len(sentences))  # Avoid division by zero

    words = re.findall(r"\b\w+\b", text.lower())
    word_count = max(1, len(words))  # Avoid division by zero

    # Simple syllable counting (very approximate)
    def count_syllables_regex(word):
        word = word.lower()
        if len(word) <= 3:
            return 1
        word = re.sub(
            r"(?:[^laeiouy]es|[^laeiouy]e)$", "", word
        )  # Remove common endings
        word = re.sub(r"^y", "", word)  # Remove starting 'y'
        syllable_count = len(re.findall(r"[aeiouy]{1,}", word))
        return max(1, syllable_count)  # Ensure at least one syllable

    syllable_count = sum(count_syllables_regex(word) for word in words)

    # Calculate score based on method
    score = 0.0

    if method == "flesch_kincaid":
        # Flesch Reading Ease score (higher is easier to read)
        try:
            score = (
                206.835
                - 1.015 * (word_count / sentence_count)
                - 84.6 * (syllable_count / word_count)
            )
            score = max(0.0, min(100.0, score))  # Clamp score to 0-100 range
        except ZeroDivisionError:
            score = 0.0  # Handle potential division by zero if counts are zero
    else:
        # Other methods are harder to approximate reliably with regex
        return {
            "ruleName": rule_name,
            "passed": True,  # Or False
            "message": f"Readability method '{method}' requires spaCy (using regex fallback for Flesch-Kincaid only).",
            "score": None,
            "min_score": min_score,
            "method": method,
        }

    passed = score >= min_score

    return {
        "ruleName": rule_name,
        "passed": passed,
        "message": (
            None
            if passed
            else f"Readability score is {score:.1f}, but minimum required is {min_score} (regex fallback)"
        ),
        "score": round(score, 1),
        "min_score": min_score,
        "method": method,
    }


# Enhanced readability evaluation with spaCy
def evaluate_readability_spacy(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    """
    Evaluate text readability using spaCy for better counts.
    Currently implements Flesch-Kincaid Reading Ease.
    """
    if not SPACY_AVAILABLE or nlp is None:
        logger.warning(
            "Attempted spaCy readability check, but model not loaded. Falling back to regex."
        )
        return evaluate_readability_regex(text, parameters, rule_name)

    min_score = parameters.get("min_score", 60)
    method = parameters.get(
        "method", "flesch_kincaid"
    )  # Primarily supports Flesch-Kincaid

    try:
        doc = nlp(text)

        # Use spaCy for sentence and token counts
        num_sentences = max(1, len(list(doc.sents)))
        # Count tokens that are actual words (not punctuation or spaces)
        num_words = max(1, len([token for token in doc if token.is_alpha]))

        # Syllable counting heuristic (can be improved with libraries like 'syllapy' if needed)
        def count_syllables_heuristic(word_token):
            word = word_token.text.lower()
            # Basic heuristic: count vowel groups
            count = len(re.findall(r"[aeiouy]+", word))
            # Adjustments for common patterns (very basic)
            if word.endswith("e") and not word.endswith("le") and count > 1:
                count -= 1
            if word.endswith("ed") or word.endswith("es"):
                # Check previous char to avoid counting 'e' in 'needed' twice
                if len(word) > 2 and word[-3] not in "aeiouy":
                    pass  # Keep count as is
                elif count > 1:  # Avoid reducing syllable count below 1
                    pass  # Heuristic is tricky here, maybe don't adjust
            return max(1, count)  # Ensure at least 1 syllable

        num_syllables = sum(
            count_syllables_heuristic(token) for token in doc if token.is_alpha
        )

        score = 0.0
        interpretation = "N/A"

        if method == "flesch_kincaid":
            try:
                # Flesch Reading Ease score
                score = (
                    206.835
                    - 1.015 * (num_words / num_sentences)
                    - 84.6 * (num_syllables / num_words)
                )
                score = max(0.0, min(100.0, score))  # Clamp score

                # Interpretation based on score
                if score >= 90:
                    interpretation = "Very easy (5th grade)"
                elif score >= 80:
                    interpretation = "Easy (6th grade)"
                elif score >= 70:
                    interpretation = "Fairly easy (7th grade)"
                elif score >= 60:
                    interpretation = "Standard (8th-9th grade)"
                elif score >= 50:
                    interpretation = "Fairly difficult (10th-12th grade)"
                elif score >= 30:
                    interpretation = "Difficult (College)"
                else:
                    interpretation = "Very difficult (Graduate)"

            except ZeroDivisionError:
                score = 0.0
                interpretation = "Calculation error (division by zero)"
        else:
            # Fallback or indicate method not supported by this spaCy implementation yet
            logger.warning(
                f"Readability method '{method}' not fully implemented with spaCy, using Flesch-Kincaid."
            )
            # Optionally, could try to implement others or just return Flesch-Kincaid
            return evaluate_readability_spacy(
                text, {"method": "flesch_kincaid", **parameters}, rule_name
            )

        passed = score >= min_score

        return {
            "ruleName": rule_name,
            "passed": passed,
            "message": (
                None
                if passed
                else f"Readability score {score:.1f} ({interpretation}) is below minimum {min_score} (spaCy)"
            ),
            "score": round(score, 1),
            "interpretation": interpretation,
            "min_score": min_score,
            "method": method,
            "stats": {  # Add stats used
                "sentences": num_sentences,
                "words": num_words,
                "syllables": num_syllables,
            },
        }

    except Exception as e:
        logger.exception(f"Error in spaCy readability analysis: {e}")
        logger.warning("Error during spaCy readability check. Falling back to regex.")
        return evaluate_readability_regex(
            text, parameters, rule_name
        )  # Fallback on error


def evaluate_readability(
    text: str, parameters: Dict[str, Any], rule_name: str
) -> Dict[str, Any]:
    if SPACY_AVAILABLE and nlp:
        return evaluate_readability_spacy(text, parameters, rule_name)
    else:
        logger.warning("spaCy not available, using regex-based counts for readability.")
        return evaluate_readability_regex(text, parameters, rule_name)
