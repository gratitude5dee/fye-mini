import { deviceIdentity, withSessionCookie } from '../_lib/identity';
import { json, message } from '../_lib/http';

export async function GET(request: Request) {
  try {
    const identity = await deviceIdentity(request);
    return json({ ready: true }, withSessionCookie({}, identity));
  } catch (error) {
    return message(error, 'The anonymous seal could not be prepared.');
  }
}
