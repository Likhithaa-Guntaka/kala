import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const createVolunteerAnnouncementTool = tool(
  'create_volunteer_announcement',
  'Create a well-formatted Slack announcement recruiting volunteers for an event or shift. ' +
    'Use this when a user wants to post a call for volunteers. Extract the event name, date, ' +
    'time, and number of volunteers needed, plus location, skills, or a contact person if mentioned.',
  {
    event_name: z.string().describe('The name of the event or shift, e.g. "Saturday Food Distribution".'),
    date: z.string().describe('The date, e.g. "Saturday, August 16".'),
    time: z.string().describe('The time or time window, e.g. "9:00 AM – 12:00 PM".'),
    volunteers_needed: z.number().describe('How many volunteers are needed, e.g. 8.'),
    location: z.string().optional().describe('Where it takes place, if given.'),
    skills_needed: z.string().optional().describe('Any skills or requirements, if given.'),
    contact_person: z.string().optional().describe('Who to contact to sign up, if given.'),
  },
  async ({ event_name, date, time, volunteers_needed, location, skills_needed, contact_person }) => {
    const details = [
      `• 📅 *When:* ${date}, ${time}`,
      location ? `• 📍 *Where:* ${location}` : null,
      `• 🙌 *Volunteers needed:* ${volunteers_needed}`,
      skills_needed ? `• 🧰 *Helpful skills:* ${skills_needed}` : null,
    ].filter(Boolean);

    const signUp = contact_person
      ? `React with ✋ or message *${contact_person}* to grab a spot.`
      : 'React with ✋ below or reply to this message to grab a spot.';

    const announcement =
      `📣 *Volunteers needed: ${event_name}*\n\n` +
      `We're looking for *${volunteers_needed}* helping hands — could that be you?\n\n` +
      `${details.join('\n')}\n\n` +
      `${signUp}\n\n` +
      'Every shift makes a real difference. Thank you! 💛';

    const text = `${announcement}\n\n---\nWant me to post this to a channel, or tweak the tone or details first?`;

    return { content: [{ type: 'text', text }] };
  },
);
