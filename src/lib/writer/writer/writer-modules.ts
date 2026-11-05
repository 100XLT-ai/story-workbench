import type { Focus, SponsorRole, TimeValue } from "./story-type";
import type { Mechanism } from "./claim-labeller";

/** Focus modules sent to the writer; a focus not listed here gets the core prompt only. */
export const FOCUS_MODULES: Partial<Record<Focus, string>> = {
  program: `FOCUS: PROGRAM
The story is a program that continues, and the people it serves.
- Paragraph 1: a person, place or need the program meets.
- Paragraph 2 (nut graf): who runs the program, where, and how help reaches people.
- Then: who it reaches and how many, the sponsor's part, how long it has run if the time module allows.
- Close: what is different for the people it serves.
- Headline: "[Sponsor or its program] [verb] [what] for [who] in [place]".
- The program is the subject of most sentences. The sponsor is the subject only where it acted.`,
  event: `FOCUS: EVENT
The story is one event: a run, a gala, a drive, a build day.
- Say what the event is, when and where, and who it is for, by the end of paragraph 2.
- Say what the event pays for or does for its cause. The event is a means; the cause is the story.
- Quote only named speakers in QUOTES. Never quote "attendees" or "participants" in general.
- Recap: give the result the facts state. Do not describe a crowd, a mood or the weather unless a fact gives it.
- Headline: "[Event or sponsor] [raises/brings/builds] [result] for [cause]".`,
  gift_grant: `FOCUS: GIFT OR GRANT
The story is one gift: money or goods from the sponsor to a recipient.
- Name the amount, the giver and the recipient in the same sentence the first time.
- Say what the money or goods pay for, as the facts list it.
- The recipient does the work. Frame the sponsor as the one who made it possible, not the one who did it, unless the role is doer.
- What the gift will achieve is a prediction. Attribute it.
- With time upcoming (a pledge): "has committed", "will give". Never "gave" or "funded".
- Headline: "[Sponsor] [gift] helps [recipient] [do what] in [place]".`,
  giving_record: `FOCUS: GIVING RECORD
The story is the sponsor's giving across a period.
- Build the piece on the one theme the angle names: one cause, one place or one kind of help.
- Give two or three examples in full. Mention others only in one sentence or a total the facts state.
- Never list the gifts in date order. Never more than three specifics in a paragraph.
- What the company sells or how it is owned: at most one clause.
- Headline: "[Sponsor] [verb] [total or theme] for [who] in [period]".`,
  community_response: `FOCUS: COMMUNITY RESPONSE
The story is several businesses or groups responding to one crisis.
- Open on the crisis as the facts state it. Then the shared response.
- Give each business's own action. Do not group them as one effort unless the facts say they worked together.
- Keep the sponsor's direct actions apart from partner efforts it did not run.
- Close on recovery that continues, only if the facts state it.
- Headline: "[Place] [businesses/groups] [help] [who] after [crisis]".`,
};

export const TIME_MODULES: Record<TimeValue, string> = {
  upcoming: `TIME: UPCOMING
The event or start date is after publication. Nothing in it has happened.
- Write it as planned: "will", "is set for", "opens on". Never describe results, crowds or money raised.
- Give the date, the place and how to take part exactly as the facts state them, by the end of paragraph 2. This module allows a date in paragraph 1.
- Why now is the date. Do not add urgency the facts do not state.
- CTA: how to take part, with the link, date and place from the facts only. Set cta_derived to false. If the facts give no link, write a derived CTA and set cta_derived to true.`,
  latest: `TIME: LATEST
The action is done and recent.
- Past tense for what happened. Give the month ("in September"), not "recently" or "last week".
- What the sponsor or a partner expects next stays in the future tense and is attributed: "the hospital expects fewer readmissions".
- Why now is the result itself. If no fact makes it timely, give the date of the work and say nothing about timing.
- CTA: derived.`,
  this_year: `TIME: THIS YEAR
The story covers several actions in one period.
- Name the period: "in 2026" or "in the 2025-26 school year". Never "this year".
- Past tense for results. Present tense only for programs that continue.
- Open on one theme or one total. Then give two or three examples. Do not list every action.
- Use a total only when a fact states it. Never add the parts yourself.
- CTA: derived.`,
  multi_year: `TIME: MULTI-YEAR
The story covers two or more years.
- Give the start year and the span once.
- Label every figure: "each year", "in 2025", "since 2015". Never put an annual figure and a total in one sentence without saying which is which.
- When years give different figures, use the latest for the current state and name its year.
- Never compute growth, averages or percentages the facts do not state.
- Do not open on the start year or the span. Open on a scene, a person or a figure, and bring in the history in paragraph 2 or 3.
- End on the current state. Why now is a milestone or anniversary the facts state, or null.
- CTA: derived.`,
};

export const MECHANISM_NOTES: Partial<Record<Mechanism, string>> = {
  money:
    "MECHANISM: MONEY - Say whether the money is paid or promised. Give the amount, the recipient and what it pays for, as the facts state them.",
  cause_purchase:
    "MECHANISM: CAUSE PURCHASE - Say which products or purchases qualify, how much of each goes to the cause, any cap, and the end date. Never imply that all purchases fund the cause when only some do.",
  matching:
    "MECHANISM: MATCHING - Give the match ratio, the cap, who gives the match and the deadline, only as exactly as the facts allow.",
  fundraising:
    "MECHANISM: FUNDRAISING - Say who gave the money: customers, staff, the public or the sponsor. Never credit the sponsor with money others gave.",
  volunteering:
    "MECHANISM: VOLUNTEERING - Give how many people, how many hours and what they did. Give a dollar value only if a fact states it.",
  in_kind:
    "MECHANISM: IN-KIND - Name the goods or services. Give a value only if a fact states it.",
};

export const ROLE_NOTES: Record<SponsorRole, string> = {
  funder:
    "ROLE: FUNDER - The recipient does the work. It is the subject of most sentences. The sponsor is the one who made the work possible.",
  doer: "ROLE: DOER - The sponsor's own people do the work. The place or the people served is the subject; the sponsor's staff or volunteers are the ones acting.",
  one_of_many:
    "ROLE: ONE OF MANY - Several businesses or funders support one effort. Lead with the effort and what it does. Give each partner's part in the body. Never make the sponsor larger than its part.",
};

/** The modules for one story type, joined in the order the writer reads them. */
export function modulesFor(
  focus: Focus,
  time: TimeValue,
  role: SponsorRole,
  mechanisms: Mechanism[],
): string {
  return [
    FOCUS_MODULES[focus],
    TIME_MODULES[time],
    ...mechanisms.map((m) => MECHANISM_NOTES[m]),
    ROLE_NOTES[role],
  ]
    .filter((m): m is string => !!m)
    .join("\n\n");
}
