import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Create } from "./pages/Create";
import { TokenDetail } from "./pages/TokenDetail";
import { Swap } from "./pages/Swap";
import { Portfolio } from "./pages/Portfolio";
import { Dice } from "./pages/Dice";
import { Bridge } from "./pages/Bridge";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="create" element={<Create />} />
        <Route path="swap" element={<Swap />} />
        <Route path="bridge" element={<Bridge />} />
        <Route path="dice" element={<Dice />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="token/:address" element={<TokenDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
