import MaterialTextField, { TextFieldProps } from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Wrapper } from './styles';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
  // A second line in the menu, e.g. why the option is disabled.
  description?: string;
}

export interface IProps extends Omit<TextFieldProps, 'select'> {
  options: SelectOption[];
}

export const Select = (props: IProps) => {
  const { options, ...rest } = props;
  const described = options.some(option => option.description);

  return (
    <Wrapper>
      <MaterialTextField
        {...rest}
        select
        fullWidth
        {...(described
          ? {
              slotProps: {
                ...rest.slotProps,
                // The closed field shows the label alone.
                select: {
                  renderValue: (value: unknown) =>
                    options.find(option => option.value === value)?.label ?? ''
                }
              }
            }
          : {})}
      >
        {options.map(option => (
          <MenuItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.description ? (
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                {option.label}
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    whiteSpace: 'normal',
                    opacity: 0.85
                  }}
                >
                  {option.description}
                </span>
              </span>
            ) : (
              option.label
            )}
          </MenuItem>
        ))}
      </MaterialTextField>
    </Wrapper>
  );
};
