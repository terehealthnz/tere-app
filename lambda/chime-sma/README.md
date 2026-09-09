# Tere Chime SMA Lambda — deploy notes

The SIP Media Application (SMA) Lambda is invoked by AWS Chime SDK Voice
on every event in an outbound PSTN call's lifecycle. Server-side dial is
triggered by `POST /api/chime-dial`, which calls
`CreateSipMediaApplicationCall` and passes MeetingId + JoinToken through
`Arguments` (delivered to this Lambda as `CallDetails.TransactionAttributes`).

## 1. IAM: Lambda execution role

Trust policy — Chime SDK Voice must be able to invoke us:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole" }
  ]
}
```

Execution policy — CloudWatch logs + the JoinChimeMeeting action needs to
create an attendee on our behalf:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
      "Resource": "arn:aws:logs:ap-southeast-2:*:*" },
    { "Effect": "Allow",
      "Action": ["chime:CreateAttendee","chime-sdk-meetings:CreateAttendee","chime:GetMeeting","chime-sdk-meetings:GetMeeting"],
      "Resource": "*" }
  ]
}
```

## 2. Package + deploy

```bash
cd lambda/chime-sma
zip -j chime-sma.zip handler.mjs

aws lambda create-function \
  --function-name tere-chime-sma \
  --runtime nodejs22.x \
  --role arn:aws:iam::<account-id>:role/tere-chime-sma-role \
  --handler handler.handler \
  --zip-file fileb://chime-sma.zip \
  --region ap-southeast-2 \
  --timeout 10 \
  --memory-size 256
```

Update path (redeploys):

```bash
zip -j chime-sma.zip handler.mjs
aws lambda update-function-code \
  --function-name tere-chime-sma \
  --zip-file fileb://chime-sma.zip \
  --region ap-southeast-2
```

## 3. Resource policy — let Chime SDK Voice invoke the Lambda

```bash
aws lambda add-permission \
  --function-name tere-chime-sma \
  --statement-id ChimeSMAInvoke \
  --action lambda:InvokeFunction \
  --principal voiceconnector.chime.amazonaws.com \
  --source-account <account-id> \
  --region ap-southeast-2
```

> If this account is on SMA v1 (rare in new accounts) use principal
> `chime.amazonaws.com` instead. `aws chime-sdk-voice list-sip-media-applications`
> will show which control-plane API version the SMA was created under.

## 4. Create the SMA + link a phone number

```bash
# Create the SMA (record the returned SipMediaApplicationId → CHIME_SMA_ID)
aws chime-sdk-voice create-sip-media-application \
  --aws-region ap-southeast-2 \
  --name tere-outbound-dial \
  --endpoints LambdaArn=arn:aws:lambda:ap-southeast-2:<account-id>:function:tere-chime-sma

# Order a phone number in ap-southeast-2 (returns E.164 → CHIME_SMA_FROM_NUMBER)
aws chime-sdk-voice search-available-phone-numbers --country NZ
aws chime-sdk-voice create-phone-number-order --product-type SipMediaApplicationDialIn --e164-phone-numbers "+6431234567"

# Wire the number to the SMA via a SIP rule (required even for outbound-only,
# so incoming DTMF/hangup events route back to our Lambda)
aws chime-sdk-voice create-sip-rule \
  --name tere-outbound-rule \
  --trigger-type ToPhoneNumber \
  --trigger-value "+6431234567" \
  --target-applications SipMediaApplicationId=<sma-id>,Priority=1,AwsRegion=ap-southeast-2
```

## 5. Verify

Server-side dial happens via `/api/chime-dial`. To smoke-test the Lambda in
isolation, run a synthetic `CALL_ANSWERED` event through the AWS console
"Test" tab — it should return an `Actions` array containing one
`JoinChimeMeeting`. Logs go to `/aws/lambda/tere-chime-sma`.
