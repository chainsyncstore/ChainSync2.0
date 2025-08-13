#!/usr/bin/env node

/**
 * Payment Issues Fix Script
 * This script provides step-by-step guidance to fix common payment issues
 * on the deployed ChainSync site.
 */

function showHeader() {
  console.log('🔧 ChainSync Payment Issues Fix Script');
  console.log('=====================================\n');
}

function showEnvironmentCheck() {
  console.log('📋 Step 1: Check Environment Variables');
  console.log('--------------------------------------');
  console.log('Run this command to check your deployment environment:');
  console.log('  npm run check:env');
  console.log('');
  console.log('This will show you which environment variables are missing.');
  console.log('');
}

function showPaymentKeysSetup() {
  console.log('🔑 Step 2: Set Up Payment API Keys');
  console.log('-----------------------------------');
  console.log('You need to add these environment variables to your Render deployment:');
  console.log('');
  console.log('1. PAYSTACK_SECRET_KEY');
  console.log('   - Get from: https://dashboard.paystack.com/settings/developer');
  console.log('   - Format: sk_test_xxxxxxxxxxxxxxxxxxxxx (test) or sk_live_xxxxxxxxxxxxxxxxxxxxx (live)');
  console.log('');
  console.log('2. FLUTTERWAVE_SECRET_KEY');
  console.log('   - Get from: https://dashboard.flutterwave.com/settings/apis');
  console.log('   - Format: FLWSECK_TEST_xxxxxxxxxxxxxxxxxxxxx (test) or FLWSECK_xxxxxxxxxxxxxxxxxxxxx (live)');
  console.log('');
}

function showRenderSetup() {
  console.log('🚀 Step 3: Configure Render Environment Variables');
  console.log('------------------------------------------------');
  console.log('1. Go to https://dashboard.render.com');
  console.log('2. Select your ChainSync service');
  console.log('3. Click on "Environment" tab');
  console.log('4. Add these environment variables:');
  console.log('');
  console.log('   Key: PAYSTACK_SECRET_KEY');
  console.log('   Value: [Your Paystack secret key]');
  console.log('');
  console.log('   Key: FLUTTERWAVE_SECRET_KEY');
  console.log('   Value: [Your Flutterwave secret key]');
  console.log('');
  console.log('   Key: BASE_URL');
  console.log('   Value: https://yourdomain.com (your actual domain)');
  console.log('');
  console.log('5. Click "Save Changes"');
  console.log('6. Redeploy your service');
  console.log('');
}

function showTesting() {
  console.log('🧪 Step 4: Test the Payment Endpoint');
  console.log('-------------------------------------');
  console.log('After setting up the environment variables, test your payment endpoint:');
  console.log('');
  console.log('  npm run test:payment https://yourdomain.com');
  console.log('');
  console.log('Replace "yourdomain.com" with your actual domain.');
  console.log('');
}

function showTroubleshooting() {
  console.log('🔍 Step 5: Troubleshooting Common Issues');
  console.log('------------------------------------------');
  console.log('If you still have issues:');
  console.log('');
  console.log('1. Check Render logs for error messages');
  console.log('2. Verify all environment variables are set correctly');
  console.log('3. Ensure your database is accessible from Render');
  console.log('4. Check if your payment API keys are valid');
  console.log('5. Verify your domain is accessible');
  console.log('');
}

function showSupport() {
  console.log('🆘 Need Help?');
  console.log('--------------');
  console.log('If you continue to have issues:');
  console.log('');
  console.log('1. Check the troubleshooting guide: PAYMENT_BUTTON_TROUBLESHOOTING.md');
  console.log('2. Review the deployment guide: DEPLOYMENT.md');
  console.log('3. Check Render logs for specific error messages');
  console.log('4. Verify your payment gateway accounts are active');
  console.log('');
}

function showQuickCommands() {
  console.log('⚡ Quick Commands');
  console.log('------------------');
  console.log('Environment check:');
  console.log('  npm run check:env');
  console.log('');
  console.log('Test payment endpoint:');
  console.log('  npm run test:payment https://yourdomain.com');
  console.log('');
  console.log('Build verification:');
  console.log('  npm run build:verify');
  console.log('');
  console.log('Test production build:');
  console.log('  npm run test:production');
  console.log('');
}

function main() {
  showHeader();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--env-check')) {
    showEnvironmentCheck();
  } else if (args.includes('--payment-keys')) {
    showPaymentKeysSetup();
  } else if (args.includes('--render-setup')) {
    showRenderSetup();
  } else if (args.includes('--testing')) {
    showTesting();
  } else if (args.includes('--troubleshooting')) {
    showTroubleshooting();
  } else if (args.includes('--support')) {
    showSupport();
  } else if (args.includes('--quick-commands')) {
    showQuickCommands();
  } else {
    // Show all sections
    showEnvironmentCheck();
    showPaymentKeysSetup();
    showRenderSetup();
    showTesting();
    showTroubleshooting();
    showSupport();
    showQuickCommands();
  }
  
  console.log('🎯 Next Steps:');
  console.log('1. Run "npm run check:env" to see what\'s missing');
  console.log('2. Set up your payment API keys');
  console.log('3. Configure Render environment variables');
  console.log('4. Test your payment endpoint');
  console.log('5. Redeploy your service');
  console.log('');
  console.log('For detailed instructions, see: PAYMENT_BUTTON_TROUBLESHOOTING.md');
}

main();
