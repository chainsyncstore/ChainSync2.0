import { PendingSignup } from '@server/api/pending-signup';

export async function completePendingSignup(app: any, request: any, pendingToken: string, status: string = 'success') {
  const reference = `PAYSTACK_${pendingToken}`;
  PendingSignup.associateReference(pendingToken, reference);

  await request(app)
    .post('/api/payment/verify')
    .send({ reference, status })
    .expect(200);

  return reference;
}

export async function stageUserAndCompletePayment(app: any, request: any, userData: Record<string, any>) {
  const signupResponse = await request(app)
    .post('/api/auth/signup')
    .send(userData)
    .expect(202);

  const pendingToken = signupResponse.body.pendingToken as string;
  const reference = await completePendingSignup(app, request, pendingToken);

  return { pendingToken, reference };
}
