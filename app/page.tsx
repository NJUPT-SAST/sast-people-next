import { redirect } from "next/navigation";

const Default = async () => {
  return redirect("/dashboard");
};

export default Default;
