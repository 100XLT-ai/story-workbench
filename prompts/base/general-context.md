# Generate social media post for ${organization.legal_name}

## Story Article Content:
${story.generatedContent}

## BRAND CONTEXT
- Industry: ${organization.industry}
- Brand Voice: ${branding.brand_voice}
- Brand Personality: ${branding.brand_personality.join(', ')}
- Value Proposition: ${branding.value_proposition}
- Target Audiences: ${branding.target_audiences.map(a => a.segment_name).join(', ')}

## STORY CONTEXT
- Title: ${story.title}
- Headline: ${story.headline}
- Overview: ${story.brief.overview}
- Key Messages: ${story.brief.keyMessages.join('; ')}
- Target Audience: ${story.brief.targetAudience.primary}
- Call to Action: ${story.brief.callToAction}
- Tone: ${story.brief.tone}
