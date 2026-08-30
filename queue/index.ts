import { sendEmail } from "./sendEmail";
import { interviewScheduleReminder } from "./interviewScheduleReminder";
import { interviewScheduleCancellation } from "./interviewScheduleCancellation";
import {
  cleanupEmailDeliveryAttemptsJob,
  retryDueEmailDeliveriesJob,
} from "./emailMaintenance";
import { cleanupExpiredSessionsJob } from "./sessionMaintenance";

const queueFunctions = [
  sendEmail,
  interviewScheduleCancellation,
  interviewScheduleReminder,
  retryDueEmailDeliveriesJob,
  cleanupEmailDeliveryAttemptsJob,
  cleanupExpiredSessionsJob,
];

export default queueFunctions;
