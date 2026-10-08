# 类型插画（每个类型一张，文件名用四字母代码）

    INTJ.svg INTP.svg ENTJ.svg ENTP.svg INFJ.svg INFP.svg ENFJ.svg ENFP.svg
    ISTJ.svg ISFJ.svg ESTJ.svg ESFJ.svg ISTP.svg ISFP.svg ESTP.svg ESFP.svg

支持 svg / png / webp，组件按 svg → png → webp 顺序尝试。

**当前使用的是 16Personalities 的类型插画（introductions 场景图，900×350 横幅）**
来源：`https://www.16personalities.com/static/animations/type-descriptions/introductions/<slug>.svg`
（slug 为单数：architect / logician / commander / debater / advocate / mediator /
protagonist / campaigner / logistician / defender / executive / consul / virtuoso /
adventurer / entrepreneur / entertainer）。

⚠️ 这些插画版权归 16Personalities 所有，仅适合个人站自用、请勿商用；
因此本目录下图片**不入库**（见根 .gitignore），**部署时需要单独 scp 到服务器**：

    scp mascots/*.svg <server>:~/zxLumen-Blog/mbti-web/mascots/

找不到文件时回退到 emoji 拟人（见 web/src/lib/mbti-meta.ts）。
