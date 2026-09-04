# analysis.json结构

这是给AI生成文件时使用的格式，不要求用户手写。完整参考：

```json
{
  "product": {"brand":"待确认","name":"待确认","type":"待确认","variant":"待确认","source":"未提供"},
  "segments": [
    {
      "start":0,
      "end":4,
      "approximate":false,
      "action":"",
      "visualRefs":[],
      "visualChecked":false,
      "quotes":[{"ref":"transcript:0","text":"从该转写条目原样复制的子串","translation":"中文翻译"}],
      "role":"具体内容作用"
    }
  ],
  "hook":"真实位置、内容和停留动机；未核实首帧就限定为口播Hook",
  "pain":"痛点和视频回应方式",
  "visual":"已查看的视觉与已听到的声音；缺少就写未核实",
  "trust":"证据链，区分实际观察和博主宣称",
  "structure":"按实际先后排列的内容链及核心转折",
  "formula":"可迁移结构",
  "caveats":["必要核实边界"]
}
```

- start/end可用秒数或MM:SS，段落不重叠，不超过证据包duration。粗采样的区间设approximate:true。
- 只看过frame:0的状态，可以引用它并说明“该时刻画面显示”；不能由一帧断言完整擦拭过程。
- action非空必须有同区间visualRefs和visualChecked:true；只有实际看过才设true。
- 无口播quotes=[]；只有口播action=""且visualRefs=[]。
- quotes的text必须是引用转写条目的原文子串。修改疑似ASR错误时先保留原始证据，在caveats中说明，不悄悄修成确定原话。
- demo:true只用于合成示例，真实报告省略。
- 程序验证的是结构一致性，不是事实真实性；hook/visual等自由文本也必须遵守同样的证据规则。
