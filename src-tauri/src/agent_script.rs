use serde_json::Value;

const MAX_SCRIPT_CHARS: usize = 20_000;

pub fn run(code: &str, input: &Value) -> Result<Value, String> {
    if code.trim().is_empty() {
        return Err("脚本不能为空".into());
    }
    if code.chars().count() > MAX_SCRIPT_CHARS {
        return Err("脚本超过 20000 字限制".into());
    }
    let mut engine = rhai::Engine::new();
    engine.set_max_operations(200_000);
    engine.set_max_call_levels(32);
    engine.set_max_expr_depths(64, 32);
    engine.set_max_array_size(20_000);
    engine.set_max_map_size(5_000);
    engine.set_max_string_size(2_000_000);
    let ast = engine
        .compile(code)
        .map_err(|error| format!("脚本编译失败: {error}"))?;
    let mut scope = rhai::Scope::new();
    let dynamic =
        rhai::serde::to_dynamic(input).map_err(|error| format!("脚本输入无效: {error}"))?;
    scope.push_dynamic("input", dynamic);
    let result = engine
        .eval_ast_with_scope::<rhai::Dynamic>(&mut scope, &ast)
        .map_err(|error| format!("脚本执行失败: {error}"))?;
    rhai::serde::from_dynamic(&result).map_err(|error| format!("脚本结果无法序列化: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn evaluates_with_json_input() {
        assert_eq!(
            run("input.a + input.b", &json!({"a":2,"b":3})).unwrap(),
            json!(5)
        );
    }

    #[test]
    fn stops_unbounded_work() {
        assert!(run("while true {}", &json!({})).is_err());
    }
}
