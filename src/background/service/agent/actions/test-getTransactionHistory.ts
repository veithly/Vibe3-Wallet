// Test file for getTransactionHistory functionality
import { Web3Action } from './web3-actions';
import { GetTransactionHistoryActionParams } from './web3-schemas';

// Mock test function
async function testGetTransactionHistory() {
  const web3Action = new Web3Action({} as any);

  const params: GetTransactionHistoryActionParams = {
    address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    limit: 10
  };

  try {
    const result = await web3Action.getTransactionHistory(params);
    console.log('Transaction History Result:', result);

    if (result.success) {
      console.log('Total transactions:', result.data.totalTransactions);
      console.log('Pending transactions:', result.data.pendingCount);
      console.log('Completed transactions:', result.data.completedCount);
      console.log('Networks involved:', result.data.networks);
      console.log('Sample transactions:', result.data.transactions.slice(0, 3));
    } else {
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Export for potential use
export { testGetTransactionHistory };
