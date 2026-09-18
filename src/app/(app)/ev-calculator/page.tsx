import { PageHead } from "@/components/PageHead";
import { EVCalculator } from "@/components/EVCalculator";

export default function EvCalculatorPage() {
  return (
    <div>
      <PageHead
        title="EV Calculator"
        subtitle="Which funded account actually pays, given your numbers. Runs a Monte Carlo simulation of every account against each firm's real evaluation rules — drawdown, profit target, fees, splits — to rank them by expected value, not marketing."
      />
      <EVCalculator />
    </div>
  );
}
