<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const isDev = import.meta.env.DEV

const role = ref<'customer' | 'agent'>('customer')
const mode = ref<'login' | 'register'>('login')
const account = ref('')
const password = ref('')
const confirmPassword = ref('')
const name = ref('')
const phone = ref('')
const agentId = ref('')
const employeeNo = ref('')
const department = ref('')
const inviteCode = ref('')
const showPassword = ref(false)
const errorMessage = ref('')

const roleCopy = computed(() =>
  role.value === 'agent'
    ? {
        title: mode.value === 'register' ? '业务员注册' : '业务员登录',
        description:
          mode.value === 'register'
            ? '使用邀请码开通业务工作台账号。'
            : '进入业务工作台，管理会话、批量建单和人工接管工单。',
        accountPlaceholder: '业务员ID、工号或手机号',
      }
    : {
        title: mode.value === 'register' ? '客户注册' : '客户登录',
        description:
          mode.value === 'register'
            ? '创建账号后，由绑定业务员协助完成车险出单。'
            : '登录后由智能体协助完成车辆信息、方案、报价与支付。',
        accountPlaceholder: '客户ID或手机号',
      },
)

function selectRole(nextRole: 'customer' | 'agent') {
  role.value = nextRole
  account.value = ''
  password.value = ''
  confirmPassword.value = ''
  name.value = ''
  phone.value = ''
  agentId.value = ''
  employeeNo.value = ''
  department.value = ''
  inviteCode.value = ''
  errorMessage.value = ''
}

function switchMode(nextMode: 'login' | 'register') {
  mode.value = nextMode
  password.value = ''
  confirmPassword.value = ''
  errorMessage.value = ''
}

function fillDemo() {
  if (role.value === 'agent') {
    account.value = 'agent_001'
    password.value = 'Agent@123'
  } else {
    account.value = 'customer_001'
    password.value = 'Customer@123'
  }
  errorMessage.value = ''
}

async function submitLogin() {
  if (authStore.loading) return
  errorMessage.value = ''
  if (!account.value.trim() || !password.value) {
    errorMessage.value = '请输入账号和密码'
    return
  }
  if (mode.value === 'register') {
    if (!name.value.trim() || !phone.value.trim()) {
      errorMessage.value = '请输入姓名和手机号'
      return
    }
    if (password.value !== confirmPassword.value) {
      errorMessage.value = '两次输入的密码不一致'
      return
    }
    if (role.value === 'agent' && !inviteCode.value.trim()) {
      errorMessage.value = '请输入业务员邀请码'
      return
    }
  }
  try {
    const user =
      mode.value === 'register'
        ? await authStore.register({
            role: role.value,
            account: account.value,
            name: name.value,
            phone: phone.value,
            password: password.value,
            agent_id: role.value === 'customer' ? agentId.value : undefined,
            employee_no: role.value === 'agent' ? employeeNo.value : undefined,
            department: role.value === 'agent' ? department.value : undefined,
            invite_code: role.value === 'agent' ? inviteCode.value : undefined,
          })
        : await authStore.login(account.value, password.value, role.value)
    await router.replace(user.role === 'agent' ? '/agent' : '/')
  } catch (error) {
    errorMessage.value = (error as Error).message || '登录失败'
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-brand-panel">
      <img class="login-brand-mark" src="/brand-mark.svg" alt="车险出单智能体" />
      <div class="login-brand-copy">
        <p class="login-eyebrow">AUTO INSURANCE AGENT</p>
        <h1>车险出单智能体</h1>
        <p class="login-lead">从证件识别、方案推荐到报价核保，用自然语言完成整个车险出单流程。</p>
      </div>

      <div class="login-capabilities">
        <div class="login-capability">
          <span>01</span>
          <div>
            <strong>多模态识别</strong>
            <p>行驶证与身份证影像自动提取，字段异常转人工。</p>
          </div>
        </div>
        <div class="login-capability">
          <span>02</span>
          <div>
            <strong>智能方案问答</strong>
            <p>支持自然语言咨询、修改险种和确认投保方案。</p>
          </div>
        </div>
        <div class="login-capability">
          <span>03</span>
          <div>
            <strong>人工协同接管</strong>
            <p>业务员可认领异常会话，处理完成后继续原流程。</p>
          </div>
        </div>
      </div>

      <div class="login-security-note">
        <span class="security-dot" />
        登录凭据在浏览器端加密，刷新 Token 使用 HttpOnly Cookie
      </div>
    </section>

    <section class="login-form-panel">
      <div class="login-card">
        <div class="login-card-heading">
          <p>{{ mode === 'register' ? '创建安全账号' : '安全登录' }}</p>
          <h2>{{ roleCopy.title }}</h2>
          <span>{{ roleCopy.description }}</span>
        </div>

        <div class="auth-mode-switch">
          <button type="button" :class="{ active: mode === 'login' }" @click="switchMode('login')">
            登录
          </button>
          <button
            type="button"
            :class="{ active: mode === 'register' }"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <div class="role-switch" role="tablist" aria-label="登录角色">
          <button
            type="button"
            role="tab"
            :aria-selected="role === 'customer'"
            :class="{ active: role === 'customer' }"
            @click="selectRole('customer')"
          >
            客户
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="role === 'agent'"
            :class="{ active: role === 'agent' }"
            @click="selectRole('agent')"
          >
            业务员
          </button>
        </div>

        <form class="login-form" @submit.prevent="submitLogin">
          <label class="login-field">
            <span>{{ role === 'agent' ? '业务员ID' : '客户ID' }}</span>
            <input
              v-model="account"
              type="text"
              autocomplete="username"
              :placeholder="
                mode === 'register' ? '4-64 位字母、数字或下划线' : roleCopy.accountPlaceholder
              "
            />
          </label>

          <template v-if="mode === 'register'">
            <div class="register-grid">
              <label class="login-field">
                <span>姓名</span>
                <input
                  v-model="name"
                  type="text"
                  autocomplete="name"
                  placeholder="请输入真实姓名"
                />
              </label>
              <label class="login-field">
                <span>手机号</span>
                <input
                  v-model="phone"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel"
                  maxlength="11"
                  placeholder="11 位手机号"
                />
              </label>
            </div>

            <label v-if="role === 'customer'" class="login-field">
              <span>绑定业务员ID</span>
              <input
                v-model="agentId"
                type="text"
                placeholder="例如：agent_001；留空将使用默认业务员"
              />
            </label>

            <template v-else>
              <div class="register-grid">
                <label class="login-field">
                  <span>业务员工号</span>
                  <input v-model="employeeNo" type="text" placeholder="例如：A0002" />
                </label>
                <label class="login-field">
                  <span>所属部门</span>
                  <input v-model="department" type="text" placeholder="例如：车险业务部" />
                </label>
              </div>
              <label class="login-field">
                <span>业务员邀请码</span>
                <input
                  v-model="inviteCode"
                  type="password"
                  autocomplete="off"
                  placeholder="请输入管理员提供的邀请码"
                />
              </label>
            </template>
          </template>

          <label class="login-field">
            <span>{{ mode === 'register' ? '设置密码' : '登录密码' }}</span>
            <div class="password-input">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
                :placeholder="
                  mode === 'register' ? '至少 8 位，含大小写字母和数字' : '请输入登录密码'
                "
              />
              <button
                type="button"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </div>
          </label>

          <label v-if="mode === 'register'" class="login-field">
            <span>确认密码</span>
            <input
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="请再次输入密码"
            />
          </label>

          <div v-if="errorMessage" class="login-error" role="alert">
            {{ errorMessage }}
          </div>

          <button type="submit" class="login-submit" :disabled="authStore.loading">
            {{
              authStore.loading
                ? mode === 'register'
                  ? '正在创建...'
                  : '正在验证...'
                : mode === 'register'
                  ? '创建账号并登录'
                  : '安全登录'
            }}
          </button>
        </form>

        <div v-if="isDev && mode === 'login'" class="demo-account">
          <div>
            <strong>当前为开发环境</strong>
            <span>
              {{ role === 'agent' ? 'agent_001 / Agent@123' : 'customer_001 / Customer@123' }}
            </span>
          </div>
          <button type="button" @click="fillDemo">填入演示账号</button>
        </div>

        <div class="login-mode-link">
          <template v-if="mode === 'login'">
            还没有账号？
            <button type="button" @click="switchMode('register')">立即注册</button>
          </template>
          <template v-else>
            已有账号？
            <button type="button" @click="switchMode('login')">返回登录</button>
          </template>
        </div>

        <p class="login-footnote">
          登录即表示您同意仅将系统用于授权车险业务操作。敏感证件信息仅用于本次投保流程。
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(380px, 1.05fr) minmax(440px, 0.95fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: #f4f7fb;
}

.login-brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 640px;
  padding: clamp(40px, 6vw, 82px);
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 88% 12%, rgba(96, 165, 250, 0.35), transparent 28%),
    radial-gradient(circle at 15% 90%, rgba(16, 185, 129, 0.2), transparent 32%),
    linear-gradient(145deg, #0f2744 0%, #153f68 48%, #1d5d86 100%);
}

.login-brand-panel::after {
  content: '';
  position: absolute;
  inset: auto -90px -120px auto;
  width: 360px;
  height: 360px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  box-shadow:
    0 0 0 50px rgba(255, 255, 255, 0.035),
    0 0 0 100px rgba(255, 255, 255, 0.025);
}

.login-brand-mark {
  width: 52px;
  height: 52px;
  object-fit: contain;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 16px;
  box-shadow: 0 10px 24px rgba(2, 14, 34, 0.28);
}

.login-brand-copy {
  max-width: 560px;
  margin-top: clamp(52px, 9vh, 102px);
}

.login-eyebrow {
  margin: 0 0 14px;
  color: #93c5fd;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.login-brand-copy h1 {
  margin: 0;
  color: #fff;
  font-size: clamp(34px, 4vw, 56px);
  font-weight: 750;
  letter-spacing: -0.04em;
}

.login-lead {
  max-width: 520px;
  margin: 18px 0 0;
  color: rgba(229, 240, 252, 0.76);
  font-size: 15px;
  line-height: 1.85;
}

.login-capabilities {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 560px;
  margin-top: 48px;
}

.login-capability {
  display: flex;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.11);
}

.login-capability > span {
  padding-top: 2px;
  color: #7dd3fc;
  font-family: var(--font-mono);
  font-size: 11px;
}

.login-capability strong {
  font-size: 14px;
}

.login-capability p {
  margin: 4px 0 0;
  color: rgba(219, 234, 254, 0.58);
  font-size: 12px;
  line-height: 1.65;
}

.login-security-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 36px;
  color: rgba(219, 234, 254, 0.58);
  font-size: 11px;
}

.security-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.12);
}

.login-form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 640px;
  padding: 36px;
}

.login-card {
  width: min(432px, 100%);
  padding: 34px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 28px 80px rgba(30, 64, 100, 0.12);
  backdrop-filter: blur(14px);
}

.login-card-heading > p {
  margin: 0 0 7px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.login-card-heading h2 {
  margin: 0;
  font-size: 25px;
}

.login-card-heading span {
  display: block;
  margin-top: 8px;
  color: var(--color-gray-500);
  font-size: 12px;
  line-height: 1.65;
}

.auth-mode-switch {
  display: flex;
  gap: 18px;
  margin-top: 20px;
  border-bottom: 1px solid var(--color-gray-200);
}

.auth-mode-switch button {
  position: relative;
  padding: 0 1px 9px;
  border: 0;
  background: transparent;
  color: var(--color-gray-400);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.auth-mode-switch button.active {
  color: var(--color-primary);
}

.auth-mode-switch button.active::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
}

.role-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 16px 0 20px;
  padding: 4px;
  border-radius: 12px;
  background: var(--color-gray-100);
}

.role-switch button {
  min-height: 38px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.role-switch button.active {
  background: var(--color-surface);
  color: var(--color-primary-active);
  box-shadow: var(--shadow-sm);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.register-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.login-field > span {
  color: var(--color-gray-700);
  font-size: 12px;
  font-weight: 600;
}

.login-field input {
  width: 100%;
  min-height: 46px;
  padding: 10px 13px;
  border: 1px solid var(--color-gray-300);
  border-radius: 11px;
  background: var(--color-surface);
  color: var(--color-gray-900);
  font-size: 14px;
  outline: none;
}

.login-field input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.password-input {
  display: flex;
  align-items: stretch;
}

.password-input input {
  padding-right: 62px;
}

.password-input button {
  width: 56px;
  margin-left: -56px;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 11px;
}

.login-error {
  padding: 9px 11px;
  border: 1px solid #fecaca;
  border-radius: 9px;
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
  font-size: 12px;
}

.login-submit {
  min-height: 46px;
  margin-top: 4px;
  border: 0;
  border-radius: 11px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.2);
}

.login-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
}

.login-submit:disabled {
  cursor: wait;
  opacity: 0.68;
}

.demo-account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 11px 12px;
  border: 1px dashed #bfdbfe;
  border-radius: 11px;
  background: var(--color-primary-soft);
}

.demo-account div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.demo-account strong {
  color: var(--color-primary-active);
  font-size: 11px;
}

.demo-account span {
  overflow-wrap: anywhere;
  color: var(--color-gray-500);
  font-family: var(--font-mono);
  font-size: 10px;
}

.demo-account button {
  flex-shrink: 0;
  padding: 6px 9px;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  background: #fff;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
}

.login-footnote {
  margin: 20px 0 0;
  color: var(--color-gray-400);
  font-size: 10px;
  line-height: 1.65;
}

.login-mode-link {
  margin-top: 14px;
  color: var(--color-gray-400);
  text-align: center;
  font-size: 11px;
}

.login-mode-link button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-brand-panel {
    min-height: auto;
    padding: 34px 26px 30px;
  }

  .login-brand-copy {
    margin-top: 34px;
  }

  .login-brand-copy h1 {
    font-size: 34px;
  }

  .login-capabilities {
    display: none;
  }

  .login-security-note {
    padding-top: 28px;
  }

  .login-form-panel {
    min-height: auto;
    padding: 22px 16px 36px;
  }
}

@media (max-width: 480px) {
  .login-card {
    padding: 24px 20px;
    border-radius: 18px;
  }

  .register-grid {
    grid-template-columns: 1fr;
  }
}
</style>
