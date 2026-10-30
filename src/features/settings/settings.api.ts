import { invokeAuthed } from "../../lib/invokeAuthed";

export type BusinessSettings = {
  businessName: string;
  taxRateBasisPoints: number;
  timezone: string;
  updatedAt: string;
};

export function getBusinessSettings() {
  return invokeAuthed<BusinessSettings>("get_business_settings");
}

export function saveBusinessSettings(settings: Pick<BusinessSettings, "businessName" | "taxRateBasisPoints">) {
  return invokeAuthed<BusinessSettings>("save_business_settings", { settings });
}
