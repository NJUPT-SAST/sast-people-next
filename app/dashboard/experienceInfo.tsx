import { ExperienceInfo } from "@/components/userInfo/experience";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";

export const ExperienceInfoServer = async ({ embedded = false }: { embedded?: boolean } = {}) => {
  const userInfo = await getUserInfo();
  const { github, blog, personalStatement, ...rest } = userInfo;
  return (
    <>
      <ExperienceInfo
        initialInfo={{
          ...rest,
          github: github ?? "",
          blog: blog ?? "",
          personalStatement: personalStatement ?? "",
        }}
        embedded={embedded}
      />
    </>
  );
};
