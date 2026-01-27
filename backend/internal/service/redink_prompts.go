package service

import _ "embed"

//go:embed prompts/redink_outline_prompt.txt
var redinkOutlinePrompt string

//go:embed prompts/redink_content_prompt.txt
var redinkContentPrompt string

//go:embed prompts/redink_image_prompt.txt
var redinkImagePrompt string

//go:embed prompts/redink_image_prompt_short.txt
var redinkImagePromptShort string

func getRedInkOutlinePrompt() string {
	return redinkOutlinePrompt
}

func getRedInkContentPrompt() string {
	return redinkContentPrompt
}

func getRedInkImagePrompt() string {
	return redinkImagePrompt
}

func getRedInkImagePromptShort() string {
	return redinkImagePromptShort
}
