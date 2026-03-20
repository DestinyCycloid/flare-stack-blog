import { Link } from "@tanstack/react-router";
import type { LoginPageProps } from "@/features/theme/contract/pages";
import { m } from "@/paraglide/messages";
import { LoginForm } from "./form";
import { SocialLogin } from "./social-login";

export function LoginPage({
  isEmailConfigured,
  loginForm,
  socialLogin,
  turnstileElement,
}: LoginPageProps) {
  // 强制启用邮箱登录
  const forceEmailEnabled = true;
  
  return (
    <div className="space-y-12">
      <header className="text-center space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/60">
          [ {m.login_label()} ]
        </p>
        <h1 className="text-2xl font-serif font-medium tracking-tight">
          {m.login_title()}
        </h1>
      </header>

      <div className="space-y-10">
        <LoginForm form={loginForm} isEmailConfigured={forceEmailEnabled} />

        <SocialLogin
          isLoading={socialLogin.isLoading}
          turnstilePending={socialLogin.turnstilePending}
          handleGithubLogin={socialLogin.handleGithubLogin}
          showDivider={forceEmailEnabled}
        />

        {turnstileElement}

        <div className="text-center pt-8">
          <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wider">
            {m.login_no_account()}{" "}
            <Link
              to="/register"
              className="text-foreground hover:opacity-70 transition-opacity ml-1"
            >
              [ {m.login_register_now()} ]
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
