import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, JsonRpcProvider } from "ethers";

const MINT_WINDOW_ABI = [
  "function openWindow() external",
  "function isWindowOpen() external view returns (bool)",
  "function getWindowInfo() external view returns (bool isOpen, uint256 day, uint256 openAt, uint256 closeAt, uint256 allocated, uint256 minted, uint256 remaining, uint256 rollover)",
];

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, multiChainProvider } = context;

  const mintWindowAddress = userArgs.mintWindowAddress as string;
  if (!mintWindowAddress) {
    return { canExec: false, message: "Missing mintWindowAddress user arg" };
  }

  const provider = multiChainProvider.default() as any;
  const mintWindow = new Contract(mintWindowAddress, MINT_WINDOW_ABI, provider);

  try {
    // Check if window is already open
    const isOpen = await mintWindow.isWindowOpen();

    if (isOpen) {
      return { canExec: false, message: "Window already open — skipping" };
    }

    // Window is closed — open a new one
    return {
      canExec: true,
      callData: [
        {
          to: mintWindowAddress,
          data: mintWindow.interface.encodeFunctionData("openWindow"),
        },
      ],
    };
  } catch (err: any) {
    return {
      canExec: false,
      message: `Error checking window state: ${err.message}`,
    };
  }
});
