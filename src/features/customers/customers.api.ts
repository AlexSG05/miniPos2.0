import { invokeAuthed } from "../../lib/invokeAuthed";

export type Customer = {
  id: number; name: string; phone: string | null; taxId: string | null; address: string | null;
  creditLimitCents: number; creditDays: number; balanceCents: number;
  accountStatus: "active" | "blocked"; hasOverdue: boolean;
};
export type CustomerInput = Omit<Customer, "id" | "balanceCents" | "hasOverdue">;
export type CreditTicket = {
  creditSaleId: number; saleId: number; folio: string; originalAmountCents: number;
  paidCents: number; balanceDueCents: number; issuedAt: string; dueAt: string;
  daysUntilDue: number | null; status: "open" | "paid" | "voided";
};
export type PaymentAllocation = { folio: string; allocatedCents: number; balanceAfterCents: number };
export type CustomerPaymentRecord = {
  id: number; amountCents: number; balanceAfterCents: number; method: "cash" | "transfer";
  reference: string | null; createdAt: string; cashierName: string; allocations: PaymentAllocation[];
};
export type CustomerStatement = { customer: Customer; tickets: CreditTicket[]; payments: CustomerPaymentRecord[] };
export type CustomerPaymentReceipt = {
  id: number; customerId: number; customerName: string; amountCents: number;
  balanceAfterCents: number; method: "cash" | "transfer"; reference: string | null;
  createdAt: string; cashierName: string; allocations: PaymentAllocation[];
};

export function listCustomers() { return invokeAuthed<Customer[]>("list_customers"); }
export function createCustomer(customer: CustomerInput) { return invokeAuthed<Customer>("create_customer", { customer }); }
export function updateCustomer(customerId: number, customer: CustomerInput) { return invokeAuthed<Customer>("update_customer", { customerId, customer }); }
export function getCustomerStatement(customerId: number) { return invokeAuthed<CustomerStatement>("get_customer_statement", { customerId }); }
export function receiveCustomerPayment(payment: { operationId: string; customerId: number; amountCents: number; method: "cash" | "transfer"; reference: string }) {
  return invokeAuthed<CustomerPaymentReceipt>("receive_customer_payment", { payment });
}
