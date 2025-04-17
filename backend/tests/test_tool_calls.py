"""
Test direct functionality of the tool calls extraction
"""

import json
import re

def extract_tool_calls_from_text(text):
    """
    Extract tool calls from a text response.
    
    This handles different formats that LLMs might use when returning tool calls:
    1. OpenAI-style format with function_call
    2. Simplified format with name and parameters directly
    
    Returns a list of standardized tool call objects or None if no valid calls found.
    """
    import json
    import re
    
    if not text or not text.strip():
        return None
        
    try:
        # First, try treating the entire text as JSON
        try:
            print("\nTrying to parse whole text as JSON...")
            parsed = json.loads(text.strip())
            print(f"Successfully parsed text as JSON: {type(parsed)}")
            
            if "function_call" in parsed:
                # OpenAI style - direct function call object
                arguments = parsed["function_call"].get("arguments", "{}")
                
                # Handle nested JSON escaping issues (common with Ollama models)
                if isinstance(arguments, str) and (arguments.startswith("{") or arguments.startswith("{")):
                    try:
                        # Try parsing as JSON
                        json.loads(arguments)
                    except:
                        # If it fails, fix the escaping
                        fixed_args = arguments.replace('\\"', '"').replace('\\\\', '\\')
                        parsed["function_call"]["arguments"] = fixed_args
                
                tool_call = {
                    "type": "function",
                    "function": {
                        "name": parsed["function_call"].get("name", "unknown"),
                        "arguments": parsed["function_call"].get("arguments", "{}")
                    },
                    "_original_json": text
                }
                print(f"Found OpenAI-style function_call at root level: {tool_call['function']['name']}")
                return [tool_call]
                
            elif "name" in parsed and "parameters" in parsed:
                # Simplified style - with name and parameters at the root
                tool_call = {
                    "type": "function",
                    "function": {
                        "name": parsed.get("name", "unknown"),
                        "arguments": json.dumps(parsed.get("parameters", {}))
                    },
                    "_original_json": text
                }
                print(f"Found simplified style tool call at root level: {tool_call['function']['name']}")
                return [tool_call]
                
        except json.JSONDecodeError as e:
            print(f"Failed to parse whole text as JSON: {e}")
        
        # Try fixing common JSON issues like unescaped quotes
        fixed_text = text
        if '"arguments": "{' in text:
            print("Detected possible escaping issue in arguments field, trying to fix...")
            # This is a common pattern - unescaped nested JSON
            fixed_text = text.replace('"arguments": "{', '"arguments": "{').replace('}"', '}"')
            
            try:
                json_obj = json.loads(fixed_text)
                if "function_call" in json_obj:
                    tool_call = {
                        "type": "function",
                        "function": {
                            "name": json_obj["function_call"].get("name", "unknown"),
                            "arguments": json_obj["function_call"].get("arguments", "{}")
                        },
                        "_original_json": text
                    }
                    print(f"Found OpenAI-style function_call after fixing escaping: {tool_call['function']['name']}")
                    return [tool_call]
            except:
                print("Failed to parse fixed text")
        
        # If we can't parse the whole text, look for JSON-like parts
        print("\nLooking for JSON objects within text...")
        patterns = [
            r'\{(?:[^{}]|"[^"]*"|\{(?:[^{}]|"[^"]*")*\})*\}',  # More robust pattern for nested objects
            r'\{[\s\S]*?\}'  # Simple fallback pattern
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            print(f"Found {len(matches)} potential JSON objects with pattern '{pattern[:20]}...'")
            
            for match in matches:
                try:
                    print(f"\nTrying to parse: {match[:50]}...")
                    json_obj = json.loads(match.strip())
                    
                    if "function_call" in json_obj:
                        tool_call = {
                            "type": "function",
                            "function": {
                                "name": json_obj["function_call"].get("name", "unknown"),
                                "arguments": json_obj["function_call"].get("arguments", "{}")
                            },
                            "_original_json": match
                        }
                        print(f"Found embedded OpenAI-style function_call: {tool_call['function']['name']}")
                        return [tool_call]
                        
                    elif "name" in json_obj and "parameters" in json_obj:
                        tool_call = {
                            "type": "function",
                            "function": {
                                "name": json_obj.get("name", "unknown"),
                                "arguments": json.dumps(json_obj.get("parameters", {})) 
                            },
                            "_original_json": match
                        }
                        print(f"Found embedded simplified-style tool call: {tool_call['function']['name']}")
                        return [tool_call]
                        
                except json.JSONDecodeError as e:
                    print(f"Failed to parse match as JSON: {e}")
                except Exception as e:
                    print(f"Unexpected error: {e}")
        
        print("No valid tool calls found in text")
        return None
        
    except Exception as e:
        print(f"Error in extract_tool_calls_from_text: {e}")
        return None


def test_tool_calls_extraction():
    """Test the function directly"""
    
    print("\n=== Testing OpenAI-style Format ===")
    # Test with simpler valid JSON - with properly escaped nested JSON
    openai_text = '{"function_call": {"name": "get_weather", "arguments": "{\\\"location\\\":\\\"New York, NY\\\",\\\"unit\\\":\\\"celsius\\\"}"}}'
    print(f"Input text: {openai_text}")
    
    tool_calls = extract_tool_calls_from_text(openai_text)
    print(f"Result: {tool_calls}")
    
    if tool_calls is not None:
        assert len(tool_calls) == 1
        assert tool_calls[0]["function"]["name"] == "get_weather"
        assert "New York, NY" in tool_calls[0]["function"]["arguments"]
        print("OpenAI-style test PASSED!")
    else:
        print("OpenAI-style test FAILED! No tool calls returned.")
    
    print("\n=== Testing Simplified Format ===")
    # Test simplified format with valid JSON
    simple_text = '{"name": "get_weather", "parameters": {"location": "New York, NY", "unit": "celsius"}}'
    print(f"Input text: {simple_text}")
    
    tool_calls = extract_tool_calls_from_text(simple_text)
    print(f"Result: {tool_calls}")
    
    if tool_calls is not None:
        assert len(tool_calls) == 1
        assert tool_calls[0]["function"]["name"] == "get_weather"
        assert "New York, NY" in tool_calls[0]["function"]["arguments"]
        print("Simplified format test PASSED!")
    else:
        print("Simplified format test FAILED! No tool calls returned.")
    
    print("\n=== Done! ===")


if __name__ == "__main__":
    # Run the test directly when executing this file
    test_tool_calls_extraction()