import { sendEmail } from "./sendEmail";
import { interviewScheduleReminder } from "./interviewScheduleReminder";

const queueFunctions = [sendEmail, interviewScheduleReminder];

export default queueFunctions;
