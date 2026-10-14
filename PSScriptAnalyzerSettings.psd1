@{
    IncludeRules = @(
        'PSPlaceOpenBrace',
        'PSPlaceCloseBrace',
        'PSUseConsistentWhitespace',
        'PSUseConsistentIndentation'
    )
    Rules = @{
        PSPlaceOpenBrace = @{
            Enable = $true
            OnSameLine = $true
            NewLineAfter = $true
            IgnoreOneLineBlock = $false
        }
        PSPlaceCloseBrace = @{
            Enable = $true
            NewLineAfter = $false
            IgnoreOneLineBlock = $false
            NoEmptyLineBefore = $true
        }
        PSUseConsistentWhitespace = @{
            Enable = $true
            CheckOpenBrace = $true
            CheckInnerBrace = $true
            CheckPipe = $true
            CheckSeparator = $true
            CheckOperator = $true
            CheckOpenParen = $true
        }
        PSUseConsistentIndentation = @{
            Enable = $true
            Kind = 'space'
            IndentationSize = 4
            PipelineIndentation = 'IncreaseIndentationForFirstPipeline'
        }
    }
}
